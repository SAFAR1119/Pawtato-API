import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { Types } from 'mongoose';

// A raw invalid ObjectId in a route param (e.g. GET /pets/not-an-id) would
// otherwise reach Mongoose and throw a CastError, which isn't an
// HttpException — AllExceptionsFilter then reports it as a 500, hiding a
// plain bad-input error as a server failure. This turns it into a clean 400.
@Injectable()
export class ParseMongoIdPipe implements PipeTransform<string, string> {
  transform(value: string, metadata: ArgumentMetadata): string {
    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(
        `${metadata.data ?? 'id'} must be a valid Mongo ObjectId`,
      );
    }

    return value;
  }
}
