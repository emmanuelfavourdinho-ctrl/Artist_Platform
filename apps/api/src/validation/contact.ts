import { z } from 'zod';

export const createContactMessageSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  email: z.string().trim().email('Please enter a valid email address').max(320),
  subject: z.string().trim().min(1, 'Subject is required').max(200),
  message: z.string().trim().min(1, 'Message is required').max(5000),
});

export type CreateContactMessageInput = z.infer<typeof createContactMessageSchema>;

export const recordEmailOutcomeSchema = z.object({
  sent: z.boolean(),
  error: z.string().max(500).optional(),
});

export type RecordEmailOutcomeInput = z.infer<typeof recordEmailOutcomeSchema>;

export const updateContactMessageStatusSchema = z.object({
  status: z.enum(['UNREAD', 'READ', 'REPLIED', 'ARCHIVED']),
});
