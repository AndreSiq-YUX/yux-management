# YUX Marketing Studio Phase 5: Radar And Controlled Research

Goal: add controlled research and weekly content radar primitives for Marketing Studio agents.

Scope:

- keep source registration in existing `marketing_sources`;
- add `marketing_source_items` for URLs, search results, RSS/blog/news/video summaries and internal source captures;
- add `marketing_research_cache` to avoid repeated reader/search calls;
- add `marketing_radar_runs` to group one Radar execution and its candidate ideas;
- add deduplication keys, opportunity scoring and curation status;
- add service methods, pure rules and internal UI panels for Radar, monitored sources and captured items;
- extend the Python worker with provider-neutral Jina Reader/Search request builders, source normalization, dedupe and idea candidate scoring;
- keep live Jina/Tavily/Serper/Firecrawl credentials and network execution optional and outside the frontend.

Out of scope:

- live scheduled jobs;
- unrestricted web browsing;
- Redator/Revisor generation;
- Jina Grounding;
- WordPress publishing;
- social network scraping.

Acceptance:

- migration and probe pass remotely;
- internal Marketing Studio can display sources, captured source items and Radar runs;
- source items can be converted into `marketing_ideas` through typed service payloads;
- worker tests prove URL normalization, cache key generation, Jina request construction, dedupe and scoring;
- focused frontend tests, type-check and build pass.
