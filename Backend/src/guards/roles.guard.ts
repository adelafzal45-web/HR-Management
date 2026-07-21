import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PostsService } from '../posts/posts.service';
import { OrdersService } from '../orders/orders.service';
import { InvalidIdException } from 'src/exception/invalid.exception';

@Injectable()
export class PostOwnerGuard implements CanActivate {
  constructor(private readonly postsService: PostsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const userId = req.headers['user-id']; 
    const postId = req.params.id;
    console.log('User ID from headers:', userId);
    console.log('Post ID from params:', postId);

    const post = await this.postsService.findOne(postId);
    if (!post) return false;

    if (post.user.id.toString() !== userId) {
      throw new ForbiddenException('You can only delete your own posts');
    }
    return true;
  }
}

@Injectable()
export class OrderOwnerGuard implements CanActivate {
  constructor(private readonly ordersService: OrdersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const userId = req.headers['user-id']; 
    const orderId = req.params.id;
    console.log('User ID from headers:', userId);
    console.log('Order ID from params:', orderId);

    const order = await this.ordersService.findOne(orderId);
    if (!order) return false;

    if (order.user.id.toString() !== userId) {
      throw new InvalidIdException(userId);
    }
    return true;
  }
}
