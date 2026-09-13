import { IsEmail, IsString, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[a-zA-Z])(?=.*\d)/, {
    message: 'password must contain letters and numbers',
  })
  password: string;

  @IsString()
  name: string;

  @IsString()
  phone: string;
}
