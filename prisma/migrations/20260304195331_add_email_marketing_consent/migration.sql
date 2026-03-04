-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "display_name" VARCHAR(255),
ADD COLUMN     "email" VARCHAR(255),
ADD COLUMN     "email_marketing_consent" VARCHAR(50),
ADD COLUMN     "first_name" VARCHAR(255),
ADD COLUMN     "last_name" VARCHAR(255);
