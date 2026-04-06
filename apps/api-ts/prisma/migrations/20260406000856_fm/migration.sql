-- CreateTable
CREATE TABLE "posts" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'toss',
    "ticker" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "author_hash" TEXT NOT NULL,
    "author_name" TEXT NOT NULL DEFAULT '익명',
    "created_at" TIMESTAMP(3) NOT NULL,
    "url" TEXT NOT NULL,
    "raw_json" TEXT,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "author_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "inserted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sentiment_results" (
    "id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "rationale" TEXT,
    "model_version" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "post_id" TEXT,
    "comment_id" TEXT,

    CONSTRAINT "sentiment_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sentiment_aggregates" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "window_type" TEXT NOT NULL,
    "support_ratio" DOUBLE PRECISION NOT NULL,
    "criticize_ratio" DOUBLE PRECISION NOT NULL,
    "neutral_ratio" DOUBLE PRECISION NOT NULL,
    "post_count" INTEGER NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sentiment_aggregates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "encrypted_blob" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crawl_jobs" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "ticker" TEXT,
    "post_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "crawl_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stocks" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "market" TEXT,

    CONSTRAINT "stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "watchlist" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "stock_id" TEXT,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_snapshots" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "level" TEXT NOT NULL DEFAULT 'Low',
    "action" TEXT NOT NULL DEFAULT '보유',
    "summary" TEXT NOT NULL DEFAULT '',
    "as_of" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stock_id" TEXT,

    CONSTRAINT "risk_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_factors" (
    "id" TEXT NOT NULL,
    "snapshot_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_factors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insider_trades" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "insider_name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "shares" INTEGER NOT NULL,
    "price_per_share" DOUBLE PRECISION NOT NULL,
    "transaction_date" TIMESTAMP(3) NOT NULL,
    "filing_date" TIMESTAMP(3) NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insider_trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institution_holdings" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "institution_name" TEXT NOT NULL,
    "shares" INTEGER NOT NULL,
    "change_shares" INTEGER NOT NULL DEFAULT 0,
    "change_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "report_date" TIMESTAMP(3) NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "institution_holdings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "score" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_indicator_bars" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "nasdaqClose" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nasdaqVol" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vixClose" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vxnClose" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dxyClose" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "wtiClose" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hyOas" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dgs2" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "soxClose" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sourceStatus" TEXT NOT NULL DEFAULT 'ok',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_indicator_bars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reversal_signals" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "signalType" TEXT NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT NOT NULL DEFAULT 'OBSERVE',
    "coreSignals" TEXT NOT NULL DEFAULT '[]',
    "supportSignals" TEXT NOT NULL DEFAULT '[]',
    "explanation" TEXT NOT NULL DEFAULT '',
    "riskTheme" TEXT NOT NULL DEFAULT '',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "return5d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "return10d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "return20d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vxnChange3d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vxnVs20dma" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hyOasChange5d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hyOasPercentile" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dgs2Change5d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "soxRelStr5d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "volumeVs20dma" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reversal_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reversal_backtests" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "sampleCount" INTEGER NOT NULL DEFAULT 0,
    "winRate5d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "winRate10d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgReturn5d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgReturn10d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgReturn20d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxDrawdownAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reversal_backtests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "posts_ticker_idx" ON "posts"("ticker");

-- CreateIndex
CREATE INDEX "posts_created_at_idx" ON "posts"("created_at");

-- CreateIndex
CREATE INDEX "comments_post_id_idx" ON "comments"("post_id");

-- CreateIndex
CREATE INDEX "sentiment_results_target_type_target_id_idx" ON "sentiment_results"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "sentiment_results_label_idx" ON "sentiment_results"("label");

-- CreateIndex
CREATE INDEX "sentiment_aggregates_ticker_window_type_idx" ON "sentiment_aggregates"("ticker", "window_type");

-- CreateIndex
CREATE INDEX "sentiment_aggregates_computed_at_idx" ON "sentiment_aggregates"("computed_at");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_account_name_key" ON "sessions"("account_name");

-- CreateIndex
CREATE INDEX "crawl_jobs_status_idx" ON "crawl_jobs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "stocks_code_key" ON "stocks"("code");

-- CreateIndex
CREATE INDEX "stocks_name_idx" ON "stocks"("name");

-- CreateIndex
CREATE UNIQUE INDEX "watchlist_ticker_key" ON "watchlist"("ticker");

-- CreateIndex
CREATE INDEX "risk_snapshots_ticker_idx" ON "risk_snapshots"("ticker");

-- CreateIndex
CREATE INDEX "risk_snapshots_as_of_idx" ON "risk_snapshots"("as_of");

-- CreateIndex
CREATE INDEX "risk_factors_snapshot_id_idx" ON "risk_factors"("snapshot_id");

-- CreateIndex
CREATE INDEX "insider_trades_ticker_idx" ON "insider_trades"("ticker");

-- CreateIndex
CREATE INDEX "insider_trades_transaction_date_idx" ON "insider_trades"("transaction_date");

-- CreateIndex
CREATE INDEX "institution_holdings_ticker_idx" ON "institution_holdings"("ticker");

-- CreateIndex
CREATE INDEX "alerts_ticker_idx" ON "alerts"("ticker");

-- CreateIndex
CREATE INDEX "alerts_read_idx" ON "alerts"("read");

-- CreateIndex
CREATE UNIQUE INDEX "market_indicator_bars_date_key" ON "market_indicator_bars"("date");

-- CreateIndex
CREATE INDEX "market_indicator_bars_date_idx" ON "market_indicator_bars"("date");

-- CreateIndex
CREATE INDEX "reversal_signals_date_idx" ON "reversal_signals"("date");

-- CreateIndex
CREATE INDEX "reversal_signals_signalType_idx" ON "reversal_signals"("signalType");

-- CreateIndex
CREATE UNIQUE INDEX "reversal_backtests_ruleId_key" ON "reversal_backtests"("ruleId");

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sentiment_results" ADD CONSTRAINT "sentiment_results_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sentiment_results" ADD CONSTRAINT "sentiment_results_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "watchlist" ADD CONSTRAINT "watchlist_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_snapshots" ADD CONSTRAINT "risk_snapshots_stock_id_fkey" FOREIGN KEY ("stock_id") REFERENCES "stocks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_factors" ADD CONSTRAINT "risk_factors_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "risk_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
