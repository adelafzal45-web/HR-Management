import { HttpException, HttpStatus } from '@nestjs/common';

export class InvalidIdException extends HttpException {
  constructor(userId: number) {
    super(
      {
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        error: 'InvalidUserIdException',
        message: `Invalid userId: ${userId}. It must be >= 1`,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
