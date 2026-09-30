ALTER TABLE "order_items" ADD COLUMN "with_dessert" boolean;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "price_amount_no_dessert" numeric(10, 2);