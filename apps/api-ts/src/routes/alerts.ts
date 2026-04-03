/**
 * Alert Routes — 리스크 알림 API
 */

import { FastifyInstance } from "fastify";
import { prisma } from "../server";

export async function alertRoutes(app: FastifyInstance) {
  // GET /alerts — 알림 목록 조회
  app.get("/", async (request, reply) => {
    const { unreadOnly } = request.query as { unreadOnly?: string };

    const where = unreadOnly === "true" ? { read: false } : {};

    const alerts = await prisma.alert.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return reply.send({ success: true, data: alerts });
  });

  // PATCH /alerts/:id/read — 알림 읽음 처리
  app.patch("/:id/read", async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      const alert = await prisma.alert.update({
        where: { id },
        data: { read: true },
      });
      return reply.send({ success: true, data: alert });
    } catch {
      return reply.status(404).send({ success: false, error: "알림을 찾을 수 없습니다" });
    }
  });
}
