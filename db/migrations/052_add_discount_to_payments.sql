-- Add discount-related columns to payment_transactions table
ALTER TABLE payment_transactions 
ADD COLUMN IF NOT EXISTS discount_token_id INTEGER NULL,
ADD COLUMN IF NOT EXISTS original_amount DECIMAL(10,2) NULL,
ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) NULL;

-- Add foreign key constraint
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'payment_transactions_discount_token_id_fkey'
    ) THEN
        ALTER TABLE payment_transactions
        ADD CONSTRAINT payment_transactions_discount_token_id_fkey
        FOREIGN KEY (discount_token_id) REFERENCES discount_tokens(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Create index for discount_token_id
CREATE INDEX IF NOT EXISTS idx_payment_transactions_discount_token_id ON payment_transactions(discount_token_id);
