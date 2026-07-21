import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import { InvalidIdException } from '../exception/invalid.exception';
@Injectable()
export class ValidateUserPipe implements PipeTransform {
  transform(value: any) {
    if (!value.name || !value.email || !value.password) {
     console.log("feilds are missing");
    }else{
      console.log("all feilds are present (i am in pipes (for users))");
    }
    return value;
  }
}

@Injectable()
export class ValidatePostPipe implements PipeTransform {
  transform(value: any) {
    if (!value.title || !value.content) {
        console.log("feilds are missing");
    }else{
        console.log("all feilds are present (i am in pipes)");
    }
    return value;
  }
}

@Injectable()
export class UserIdValidationPipe implements PipeTransform {
  transform(value: any) {
    const userId = Number(value);

    if (isNaN(userId) || userId < 1) {
      throw new InvalidIdException(userId);
    }
    console.log("userId is valid (i am in pipes)");

    return userId;
  }}
