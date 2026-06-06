# YUX Marketing Studio Phase 3: Knowledge, Brand Voice And Simple RAG

Goal: add a marketing-specific knowledge and brand voice layer on top of the shared YUX Hub knowledge tables, enabling brand profiles, products/services, document references, chunk metadata, and simple RAG search for future agents.

Scope:

- install/use `pgvector` for future embeddings;
- create `marketing_brand_profiles` for tone, persona, vocabulary, restrictions and content guidelines;
- create `marketing_products_services` for structured offers used by writers and campaign agents;
- create `marketing_knowledge_documents` linked to shared `knowledge_sources`;
- create `marketing_knowledge_chunks` linked to shared `knowledge_entries`, with optional vector embeddings and text-search fallback;
- expose a `match_marketing_knowledge` RPC for simple RAG retrieval;
- add typed frontend contracts, rules and service methods;
- add internal and portal UI panels for brand voice, products and knowledge search;
- keep upload/embedding execution manual/provider-neutral; no LangGraph worker in this phase.

Out of scope:

- live embedding generation;
- LangGraph/YUX Agent Harness;
- Jina ingestion;
- file parsing pipeline;
- WordPress publishing;
- automatic content generation.

Acceptance:

- migration and probe pass remotely;
- Marketing Studio can display brand profile, products/services and indexed knowledge;
- internal users can prepare brand/RAG context for future agents;
- portal users can see safe brand preferences and published knowledge snippets without technical embedding data;
- focused tests, type-check and build pass.
