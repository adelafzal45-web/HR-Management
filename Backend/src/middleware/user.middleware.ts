import { Injectable, NestMiddleware } from '@nestjs/common';

@Injectable()
export class UserMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void) {
    // req.headers['user-id'] = '3';
    next();
    console.log('UserMiddleware applied');
  }
}
