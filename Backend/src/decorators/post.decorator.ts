import { createParamDecorator, ExecutionContext, BadRequestException } from '@nestjs/common';

export const PostId = createParamDecorator(
    (data: unknown, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest();
        return +request.params.id;
    },
);

export const ParamId = createParamDecorator(
    (data: string | undefined, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest();


        const paramName = data || 'id' || 'userId';
        const rawId = request.params[paramName];

        const id = +rawId;
        if (isNaN(id)) {
            throw new BadRequestException(`Invalid ID for param "${paramName}"`);
        }

        return id;
    },
);