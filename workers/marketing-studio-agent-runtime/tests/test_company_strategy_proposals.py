from copy import deepcopy
from pydantic import ValidationError
import pytest
from test_mission_conversation import request

CONTENT={'schemaVersion':1,'title':'Estratégia para oficina','objective':'Aumentar agendamentos de revisão','summary':'Priorizar revisões preventivas e o atendimento da região.','sections':[],'references':{'productIds':[],'documentIds':[]}}


def run(proposal):
    from test_mission_conversation import MissionConversationWorkflowTest
    helper=MissionConversationWorkflowTest()
    def shape(body):
        body.update(kind='message',questions=[],suggestedActions=[],strategyProposal=proposal)
        body['readiness']['missing']=[]
        body['brief']={'objective':'Definir uma estratégia da empresa','requestedOutcome':'Direção comercial','packKeys':[]}
        return body
    command=request()
    command['allowedActionPacks']=[]
    command['allowedCapabilityKeys']=[]
    command['operationalContext']['companyStrategyAccess']={'canPropose':True}
    return helper.make_workflow([],response_transform=shape).respond(command)


def test_consultation_proposes_strategy_without_budget_or_executable_plan():
    response=run({'content':CONTENT,'sourceRefs':['yux:card-growth']})
    assert response.kind=='message'
    assert response.brief.packKeys==[]
    assert response.strategyProposal.content.title=='Estratégia para oficina'
    assert response.strategyProposal.strategyId is None


def test_malformed_proposal_is_rejected_without_losing_the_conversation_reply():
    response=run({'content':{'title':'Insuficiente'},'sourceRefs':[]})
    assert response.strategyProposal is None
    assert response.reply


def test_unknown_proposal_citation_does_not_become_a_published_company_fact():
    response=run({'content':CONTENT,'sourceRefs':['customer:invented-source']})
    assert response.strategyProposal is None
    assert not any(source.ref=='customer:invented-source' for source in response.sources)
