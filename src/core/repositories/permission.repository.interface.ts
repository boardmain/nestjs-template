import { Permission } from '../entities/permission.entity';

export interface IPermissionRepository {
  findById(id: string): Promise<Permission | null>;
  findByName(name: string): Promise<Permission | null>;
  findAll(): Promise<Permission[]>;
  findByResource(resource: string): Promise<Permission[]>;
  create(permission: Permission): Promise<Permission>;
  update(permission: Permission): Promise<Permission>;
  delete(id: string): Promise<boolean>;
}