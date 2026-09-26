ALTER TABLE "platform_admins" ADD COLUMN "password_reset_token_hash" text;--> statement-breakpoint
ALTER TABLE "platform_admins" ADD COLUMN "password_reset_expires_at" timestamp with time zone;