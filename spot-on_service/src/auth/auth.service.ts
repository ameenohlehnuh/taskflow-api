import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { RedisService } from '../redis/redis.service';
import { JwtPayload } from './strategies/jwt.strategy';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const ACCESS_TTL_SECONDS = 60 * 15; // 15 minutes
const BCRYPT_SALT_ROUNDS = 10;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  private refreshKey(userId: string): string {
    return `auth:refresh:${userId}`;
  }

  private async signTokens(payload: JwtPayload): Promise<AuthTokens> {
    const secret = this.configService.get<string>('JWT_SECRET', 'dev-secret');
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret,
        expiresIn: ACCESS_TTL_SECONDS,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>(
          'JWT_REFRESH_SECRET',
          'dev-refresh-secret',
        ),
        expiresIn: REFRESH_TTL_SECONDS,
      }),
    ]);
    return { accessToken, refreshToken };
  }

  private toUserDto(user: User) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      role: user.role,
      rating: user.rating,
      reviewCount: user.reviewCount,
      createdAt: user.createdAt,
    };
  }

  async register(dto: RegisterDto): Promise<AuthTokens & { user: unknown }> {
    const existing = await this.usersRepository.findOneBy({
      email: dto.email,
    });
    if (existing) {
      throw new ConflictException('Email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);
    const user = await this.usersRepository.save({
      name: dto.name,
      email: dto.email,
      passwordHash,
      phone: dto.phone,
    });

    const tokens = await this.signTokens({ sub: user.id, email: user.email });
    await this.redisService.set(
      this.refreshKey(user.id),
      tokens.refreshToken,
      REFRESH_TTL_SECONDS,
    );

    return { ...tokens, user: this.toUserDto(user) };
  }

  async login(dto: LoginDto): Promise<AuthTokens & { user: unknown }> {
    const user = await this.usersRepository.findOneBy({ email: dto.email });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.signTokens({ sub: user.id, email: user.email });
    await this.redisService.set(
      this.refreshKey(user.id),
      tokens.refreshToken,
      REFRESH_TTL_SECONDS,
    );

    return { ...tokens, user: this.toUserDto(user) };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>(
          'JWT_REFRESH_SECRET',
          'dev-refresh-secret',
        ),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const stored = await this.redisService.get(this.refreshKey(payload.sub));
    if (!stored || stored !== refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Rotation: issue a new refresh token and reset the 30-day TTL.
    const tokens = await this.signTokens({ sub: payload.sub, email: payload.email });
    await this.redisService.set(
      this.refreshKey(payload.sub),
      tokens.refreshToken,
      REFRESH_TTL_SECONDS,
    );

    return tokens;
  }

  async logout(userId: string): Promise<void> {
    await this.redisService.del(this.refreshKey(userId));
  }

  async getMe(userId: string): Promise<unknown> {
    const user = await this.usersRepository.findOneBy({ id: userId });
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.toUserDto(user);
  }

  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await this.usersRepository.findOneBy({ id: userId });
    if (!user) {
      throw new UnauthorizedException();
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid password');
    }

    await this.usersRepository.remove(user);
    await this.redisService.del(this.refreshKey(userId));
  }
}
