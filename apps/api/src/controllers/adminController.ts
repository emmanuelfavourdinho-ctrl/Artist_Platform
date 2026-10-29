import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';

export async function updateUserRole(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<Response | void> {
  try {
    const { userId, roleName } = req.body;

    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) {
      return res.status(404).json({ message: 'Role not found' });
    }

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      create: { userId, roleId: role.id },
      update: {},
    });

    await prisma.auditLog.create({
      data: {
        action: 'USER_ROLE_UPDATED',
        userId: (req as any).user?.id ?? null,
        entityType: 'User',
        entityId: userId,
        metadata: { newRole: roleName } as Prisma.InputJsonObject,
      },
    });

    return res.json({ message: 'User role updated successfully' });
  } catch (error) {
    return next(error);
  }
}
