import { PortalMarketingAutomationStudio } from '@/components/marketing-studio/PortalMarketingAutomationStudio'
import type {
  MarketingCalendarItem,
  MarketingContentReview,
  MarketingKnowledgeDocument,
  MarketingKnowledgeMatch,
  MarketingProductService,
  MarketingStudioSettings,
  PortalMarketingBrandProfile,
  PortalMarketingContentItem,
  PortalMarketingReviewDecision,
} from '@/types/marketingStudio'

interface PortalMarketingStudioWorkspaceProps {
  contents: PortalMarketingContentItem[]
  settings: MarketingStudioSettings | null
  calendarItems?: MarketingCalendarItem[]
  reviews?: MarketingContentReview[]
  brandProfile?: PortalMarketingBrandProfile | null
  productsServices?: MarketingProductService[]
  knowledgeDocuments?: MarketingKnowledgeDocument[]
  knowledgeMatches?: MarketingKnowledgeMatch[]
  onReviewDecision?: (decision: PortalMarketingReviewDecision) => void
}

export function PortalMarketingStudioWorkspace({
  contents,
  settings,
  calendarItems = [],
  reviews = [],
}: PortalMarketingStudioWorkspaceProps) {
  return (
    <PortalMarketingAutomationStudio
      contents={contents}
      settings={settings}
      calendarItems={calendarItems}
      reviews={reviews}
    />
  )
}
