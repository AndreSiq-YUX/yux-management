"""Keep account configuration questions with the system that owns those facts."""
from __future__ import annotations

import re
import unicodedata
from typing import Any


def _plain(value: Any) -> str:
    return ''.join(char for char in unicodedata.normalize('NFKD', str(value or '').casefold())
                   if not unicodedata.combining(char))


def _is_account_state(value: Any, tools: list[dict[str, Any]]) -> bool:
    text = _plain(value)
    # Decisions, consent and third-party systems remain questions for the user.
    if re.search(r'(?:ferramentas?|sistemas?|integracoes) extern[ao]s?\b|fora da (?:yux|plataforma)|\b(?:deseja|quer|prefere|pretende|autoriza|consentimento|aprovacao|authorize|consent|prefer)\b', text):
        return False
    if re.search(r'disponiv|\bavailable\b', text) and re.search(r'\b(?:horarios?|dias?|datas?|prazos?|ofertas?|produtos?|orcamento|verba|quantidade|publico|equipe|pessoas?|empresas?|cidades?)\b', text):
        return False
    names = [_plain(tool.get('key')) for tool in tools] + [_plain(tool.get('title')) for tool in tools]
    mentions_tool = any(name and re.search(r'\b' + re.escape(name) + r'\b', text) for name in names)
    mentions_platform = bool(re.search(r'funcionalidad|ferramenta|recurso|modulo|integrac|canal|canais', text))
    state = bool(re.search(r'habilitad|desabilitad|ativad|disponiv|configurad|conectad|\benabled\b|\bavailable\b|\bconfigured\b|\bconnected\b|acesso (?:a|ao)\b', text))
    return (mentions_tool or mentions_platform) and state


def _tool_status(tool: dict[str, Any]) -> str:
    title = str(tool['title'])
    if not tool.get('enabled'):
        return f'{title} não está habilitado nesta conta.'
    if tool.get('planningAvailable'):
        return f'{title} está habilitado e disponível para planejamento.'
    blockers = set(tool.get('blockers') or [])
    if blockers.intersection({'integration_not_enabled', 'integration_not_enabled_for_account'}):
        return (f'{title} está habilitado na conta. Para ações diretas do agente, a integração com Missões '
                'ainda não está liberada para esta conta; isso não impede desenhar a estratégia com essa ferramenta.')
    return f'{title} está habilitado na conta, mas não está disponível para o seu acesso atual em Missões.'


def _relevant_connections(snapshot: dict[str, Any], text: str) -> list[dict[str, Any]]:
    patterns = {'whatsapp': r'whatsapp', 'email': r'e-?mail', 'ads_provider': r'anuncios?|publicidade|midia paga'}
    generic = bool(re.search(r'quais?.*(?:conexoes|conectad|integrac|canais|ferramentas)', text))
    return [item for item in snapshot.get('connections', []) if isinstance(item, dict)
            and item.get('key') in patterns and (generic or re.search(patterns[item['key']], text))]


def _connection_status(connection: dict[str, Any]) -> str:
    title = {'whatsapp': 'WhatsApp', 'email': 'E-mail', 'ads_provider': 'Canal de anúncios'}[connection['key']]
    if connection.get('status') == 'connected':
        return f'{title} está conectado.'
    if connection.get('platformAvailable'):
        return (f'O serviço de {title} está configurado na plataforma. Antes de um envio, o sistema '
                'precisa validar o remetente e as condições de uso da conta.')
    if connection.get('status') == 'not_connected':
        return f'{title} não está conectado; é necessário configurar a conexão antes de utilizá-la.'
    return f'Não foi possível verificar a conexão de {title}; é necessária uma verificação técnica pelo sistema.'


def _mentioned_tools(text: str, tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [tool for tool in tools if any(re.search(r'\b' + re.escape(_plain(name)) + r'\b', text)
            for name in (tool['key'], tool['title']))]


def _incorrect_state(sentence: str, tools: list[dict[str, Any]], snapshot: dict[str, Any]) -> bool:
    text = _plain(sentence)
    if not _is_account_state(sentence, tools):
        return False
    if '?' in sentence or re.search(r'preciso\b.{0,24}(?:confirmar|verificar)|(?:confirmar|verificar|informe|confirme)\s+(?:se|quais|qual)', text):
        return True
    # Only interpret explicit state assertions. Recommendations and decisions
    # remain the model's prose; an enablement fact never grants execution.
    for tool in _mentioned_tools(text, tools):
        claim = re.search(r'\b(nao\s+)?(?:esta\s+)?(desabilitad|habilitad|desativad|ativad)', text)
        if claim:
            asserted = not claim.group(1) and not claim.group(2).startswith('des')
            if bool(asserted) != bool(tool.get('enabled')):
                return True
    for connection in _relevant_connections(snapshot, text):
        if not re.search(r'conectad', text):
            continue
        negative = bool(re.search(r'\b(?:nao|sem)\b.{0,20}conectad', text))
        state = connection.get('status')
        if state == 'unverified' or (state == 'connected') == negative:
            return True
    return False


def _state_summary(snapshot: dict[str, Any], tools: list[dict[str, Any]], text: str) -> str:
    relevant = _mentioned_tools(_plain(text), tools)
    connections = _relevant_connections(snapshot, _plain(text))
    if not relevant and not connections:
        enabled = [str(tool['title']) for tool in tools if tool.get('enabled')]
        return 'Recursos habilitados na conta: ' + ', '.join(enabled) + '.' if enabled else 'O sistema precisa verificar a disponibilidade operacional antes da execução.'
    return ' '.join([*(_tool_status(tool) for tool in relevant), *(_connection_status(item) for item in connections)])


def enforce_account_availability(parsed: dict[str, Any], operational: dict[str, Any], organization_id: str) -> dict[str, Any]:
    snapshot = operational.get('accountAvailability')
    if not isinstance(snapshot, dict) or snapshot.get('authority') != 'server':
        return parsed  # Compatibility with older internal callers, never infer availability.
    if snapshot.get('organizationId') != organization_id:
        raise ValueError('mission_account_context_scope_mismatch')
    tools = [tool for tool in snapshot.get('tools', []) if isinstance(tool, dict) and tool.get('title') and tool.get('key')]
    questions = parsed.get('questions') or []
    removed = [question for question in questions if _is_account_state(question.get('label'), tools)]
    readiness = dict(parsed.get('readiness') or {})
    removed_keys = {question['key'] for question in removed}
    missing = readiness.get('missing') or []
    missing_state = [item for item in missing if item.get('key') in removed_keys or _is_account_state(item.get('reason'), tools)]
    reply = str(parsed.get('reply') or '')
    parts = re.split(r'(\n+|(?<=[.!?])[^\S\n]+)', reply)
    reply_state = [part for part in parts if _incorrect_state(part, tools, snapshot)]
    if not removed and not reply_state and not missing_state:
        return parsed
    result = dict(parsed)
    result['questions'] = [question for question in questions if question not in removed]
    removed_keys.update(item['key'] for item in missing_state)
    readiness['missing'] = [item for item in missing if item not in missing_state]
    for collection in ('assumptions', 'knownFacts'):
        readiness[collection] = [item for item in readiness.get(collection, []) if item.get('key') not in removed_keys]
    problem_text = _plain(' '.join([*reply_state, *[str(question.get('label', '')) for question in removed],
                                  *[str(item.get('reason', '')) for item in missing_state]]))
    connections = _relevant_connections(snapshot, problem_text)
    # Preserve paragraph boundaries and every strategic sentence. Correct only
    # the operational assertion, never regenerate/replace the human answer.
    result['reply'] = ''.join(_state_summary(snapshot, tools, part) if part in reply_state else part for part in parts)
    if removed and not reply_state:
        result['reply'] = reply + '\n\n' + _state_summary(snapshot, tools, ' '.join(str(q.get('label', '')) for q in removed))
    # Pure advisory work is useful without a connection or a concrete campaign.
    # Keep technical blockers for actual executable proposals; executors retain
    # their own authoritative readiness/consent/approval checks in every case.
    executable = parsed.get('kind') == 'brief_confirmation' or (
        bool((parsed.get('brief') or {}).get('packKeys')) and any(
            action.get('capabilityKey') for action in parsed.get('suggestedActions') or [] if isinstance(action, dict)))
    if executable:
        for connection in connections:
            if connection.get('status') != 'connected':
                readiness['missing'].append({'key': f"account_connection_{connection['key']}", 'category': 'integration',
                    'reason': _connection_status(connection), 'requiredFor': ['mission_execution']})
        relevant = _mentioned_tools(problem_text, tools)
        if any(not tool.get('planningAvailable') for tool in relevant) or any(item.get('status') != 'connected' for item in connections):
            readiness['status'] = 'needs_configuration'
    result['suggestedActions'] = [action for action in parsed.get('suggestedActions') or []
        if not _is_account_state(action.get('label'), tools)]
    result['readiness'] = readiness
    result['kind'] = 'questions' if result['questions'] else 'message'
    return result
