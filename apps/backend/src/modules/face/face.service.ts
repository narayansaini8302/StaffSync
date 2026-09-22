import { prisma } from '../../config/prisma';

const FACE_SERVICE_URL = process.env.FACE_SERVICE_URL ?? 'http://localhost:5000';

export interface EnrollResult {
  employeeId: string;
  dimensions: number;
  embeddingId: string;
}

export interface RecognizeResult {
  matched: boolean;
  employeeId?: string;
  confidence?: number;
  distance?: number;
  bestGuess?: string;
  reason?: string;
  error?: string;
}

export async function enrollFace(
  companyId: string,
  employeeId: string,
  imageBuffer: Buffer,
  filename: string,
): Promise<EnrollResult> {
  // Verify the employee belongs to this company first
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId },
  });
  if (!employee) throw new Error('EMPLOYEE_NOT_FOUND');

  const form = new FormData();
  form.append('employeeId', employeeId);
  form.append('file', new Blob([new Uint8Array(imageBuffer)]), filename || 'photo.jpg');

  const res = await fetch(`${FACE_SERVICE_URL}/enroll`, {
    method: 'POST',
    body: form as any,
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FACE_SERVICE_ERROR: ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    employeeId: string;
    embedding: number[];
    dimensions: number;
  };

  const existing = await prisma.faceEmbedding.findFirst({
    where: { employeeId },
  });

  let embeddingId: string;
  if (existing) {
    const updated = await prisma.faceEmbedding.update({
      where: { id: existing.id },
      data: { embedding: data.embedding, quality: 1.0 },
    });
    embeddingId = updated.id;
  } else {
    const created = await prisma.faceEmbedding.create({
      data: {
        employeeId,
        embedding: data.embedding,
        quality: 1.0,
      },
    });
    embeddingId = created.id;
  }

  return { employeeId, dimensions: data.dimensions, embeddingId };
}

export async function recognizeFace(
  imageBuffer: Buffer,
  filename: string,
): Promise<RecognizeResult> {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(imageBuffer)]), filename || 'photo.jpg');

  const res = await fetch(`${FACE_SERVICE_URL}/recognize`, {
    method: 'POST',
    body: form as any,
    signal: AbortSignal.timeout(30_000),
  });

  const data = await res.json();
  return data as RecognizeResult;
}

export async function listEnrolled(companyId: string) {
  return prisma.faceEmbedding.findMany({
    where: {
      employee: { companyId },
    },
    select: {
      id: true,
      employeeId: true,
      quality: true,
      createdAt: true,
      employee: {
        select: { employeeCode: true, firstName: true, lastName: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}