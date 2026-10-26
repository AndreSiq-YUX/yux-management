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
        return f'{title} está habilitado, mas sua integração com Missões ainda não está liberada para esta conta.'
    return f'{title} está habilitado na conta, mas não está disponível para o seu acesso atual em Missões.'


def _relevant_connections(snapshot: dict[str, Any], text: str) -> list[dict[str, Any]]:
    patterns = {'whatsapp': r'whatsapp', 'email': r'e-?mail', 'ads_provider': r'anuncios?|publicidade|campanhas?'}
    generic = bool(re.search(r'quais?.*(?:conexoes|conectad|integrac|canais|ferramentas)', text))
    return [item for item in snapshot.get('connections', []) if isinstance(item, dict)
            and item.get('key') in patterns and (generic or re.search(patterns[item['key']], text))]


def _connection_status(connection: dict[str, Any]) -> str:
    title = {'whatsapp': 'WhatsApp', 'email': 'E-mail', 'ads_provider': 'Canal de anúncios'}[connection['key']]
    if connection.get('status') == 'connected':
        return f'{title} está conectado.'
    if connection.get('status') == 'not_connected':
        return f'{title} não está conectado; é necessário configurar a conexão antes de utilizá-la.'
    return f'Não foi possível verificar a conexão de {title}; é necessária uma verificação técnica pelo sistema.'


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
    reply_state = [sentence for sentence in re.split(r'(?<=[.!?])\s+', reply) if _is_account_state(sentence, tools) and (
        '?' in sentence or re.search(r'preciso|necessario|confirmar|verificar|informe', _plain(sentence))
    )]
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
    relevant = [tool for tool in tools if _plain(tool['key']) in problem_text or _plain(tool['title']) in problem_text] or tools
    connections = _relevant_connections(snapshot, problem_text)
    result['reply'] = 'Consultei a configuração da conta. ' + ' '.join(_tool_status(tool) for tool in relevant)
    if connections:
        result['reply'] += ' ' + ' '.join(_connection_status(item) for item in connections)
    result['reply'] += ' A disponibilidade não substitui as verificações e aprovações específicas antes de executar ações.'
    for connection in connections:
        if connection.get('status') != 'connected':
            readiness['missing'].append({'key': f"account_connection_{connection['key']}", 'category': 'integration',
                'reason': _connection_status(connection), 'requiredFor': ['mission_planning']})
    if any(not tool.get('planningAvailable') for tool in relevant) or any(item.get('status') != 'connected' for item in connections):
        readiness['status'] = 'needs_configuration'
    result['readiness'] = readiness
    result['kind'] = 'questions' if result['questions'] else 'message'
    return result
