
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap,map } from 'rxjs/operators';
import { In } from 'typeorm';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    console.log('The interceptor is running before going into the controller');

    return next.handle().pipe(tap(() => console.log("The interceptor is running after the controller")),
      );
  }
}

@Injectable()
export class OrderDataInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    console.log('OrderDataInterceptor is running before going into the controller');
    const request = context.switchToHttp().getRequest();
    request.body={
      "productName":"product",
  "price":"123",
  "quantity":"1",
  "status":"pending"
      
    }

   return next.handle().pipe(
  map(data => ({success: true, message: 'Order placed successfully',order:data}

  ))
);
  }
}

