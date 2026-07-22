CREATE INDEX "content_snapshots_content_purged_at_fetched_at_idx"
ON "content_snapshots"("content_purged_at", "fetched_at");

CREATE INDEX "model_run_results_response_purged_at_created_at_idx"
ON "model_run_results"("response_purged_at", "created_at");

CREATE INDEX "agent_runs_conversation_purged_at_created_at_idx"
ON "agent_runs"("conversation_purged_at", "created_at");
