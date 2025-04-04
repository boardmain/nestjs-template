import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { UserService } from '@core/services/user.service';
import { UserBaseResponse } from '@application/dtos/responses/user.response';
import { UserMapper } from '@application/mappers/user.mapper';

export class UpdateUserCommand {
  constructor(
    public readonly userId: string,
    public readonly firstName?: string,
    public readonly lastName?: string,
    public readonly email?: string,
  ) {}
}

@CommandHandler(UpdateUserCommand)
export class UpdateUserCommandHandler implements ICommandHandler<UpdateUserCommand, UserBaseResponse> {
  constructor(
    private readonly userService: UserService,
  ) {}

  async execute(command: UpdateUserCommand): Promise<UserBaseResponse> {
    const { userId, firstName, lastName, email } = command;
    
    const user = await this.userService.updateUserDetails(
      userId,
      firstName,
      lastName,
      email,
    );

    // Use the mapper to convert to response DTO
    return UserMapper.toBaseResponse(user);
  }
}