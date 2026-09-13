import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateSpotDto } from './dto/create-spot.dto';
import { FilterSpotsDto } from './dto/filter-spots.dto';
import { NearbySpotsQueryDto } from './dto/nearby-spots-query.dto';
import { UpdateSpotDto } from './dto/update-spot.dto';
import { UpdateSpotStatusDto } from './dto/update-spot-status.dto';
import { SpotsService } from './spots.service';

@Controller('api/v1')
export class SpotsController {
  constructor(private readonly spotsService: SpotsService) {}

  @Get('spots')
  findFiltered(@Query() query: FilterSpotsDto) {
    return this.spotsService.findFiltered(query);
  }

  @Get('spots/nearby')
  findNearby(@Query() query: NearbySpotsQueryDto) {
    return this.spotsService.findNearby(query);
  }

  @Get('spots/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.spotsService.findOne(id);
  }

  @Get('spots/:spotId/reviews')
  findReviews(@Param('spotId', ParseUUIDPipe) spotId: string) {
    return this.spotsService.findReviews(spotId);
  }

  @Get('hosts/me/spots')
  @UseGuards(JwtAuthGuard)
  findMySpots(@Req() req: Request) {
    return this.spotsService.findByHost((req.user as { sub: string }).sub);
  }

  @Post('spots')
  @UseGuards(JwtAuthGuard)
  create(@Req() req: Request, @Body() dto: CreateSpotDto) {
    return this.spotsService.create((req.user as { sub: string }).sub, dto);
  }

  @Patch('spots/:id')
  @UseGuards(JwtAuthGuard)
  update(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSpotDto,
  ) {
    return this.spotsService.update(id, (req.user as { sub: string }).sub, dto);
  }

  @Patch('spots/:id/status')
  @UseGuards(JwtAuthGuard)
  updateStatus(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSpotStatusDto,
  ) {
    return this.spotsService.updateStatus(
      id,
      (req.user as { sub: string }).sub,
      dto.status,
    );
  }
}
