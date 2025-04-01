import { IQuery, IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { Inject } from '@nestjs/common';
import { IRoleRepository } from '@core/repositories/role.repository.interface';
import { RoleDetailResponse } from '@application/dtos/responses/role.response';
import { RoleMapper } from '@application/mappers/role.mapper';

export class GetRolesQuery implements IQuery {}

@QueryHandler(GetRolesQuery)
export class GetRolesQueryHandler implements IQueryHandler<GetRolesQuery> {
  constructor(
    @Inject('RoleRepository')
    private readonly roleRepository: IRoleRepository
  ) {}

  async execute(): Promise<RoleDetailResponse[]> {
    const roles = await this.roleRepository.findAll();

    // Use the mapper to convert each role to response DTO
    return roles.map(role => RoleMapper.toDetailResponse(role));
  }
}