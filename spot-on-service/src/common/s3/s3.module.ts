import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';

export const S3_CLIENT = Symbol('S3_CLIENT');

@Global()
@Module({
  providers: [
    {
      provide: S3_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        new S3Client({
          region: configService.get<string>('AWS_REGION', 'ap-southeast-1'),
          endpoint: configService.get<string>('AWS_S3_ENDPOINT'),
          forcePathStyle:
            configService.get<string>('AWS_S3_FORCE_PATH_STYLE', 'false') ===
            'true',
          credentials: {
            accessKeyId: configService.get<string>(
              'AWS_ACCESS_KEY_ID',
              'minioadmin',
            ),
            secretAccessKey: configService.get<string>(
              'AWS_SECRET_ACCESS_KEY',
              'minioadmin',
            ),
          },
        }),
    },
  ],
  exports: [S3_CLIENT],
})
export class S3Module {}