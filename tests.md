# Testes em React Native — Guia de Estudo

> Organizado por **conceito**, no mesmo espírito de [arquitetura-frontend.md](arquitetura-frontend.md) e [auth-forms.md](auth-forms.md): problema → mecanismo por trás → trade-off → como replicar. Preenchido com código real conforme as aulas avançam — nada especulativo. Um mapa aula → seção fica no fim.

## Índice

1. [Fundamentos: a pirâmide de testes em mobile](#1-fundamentos-a-pirâmide-de-testes-em-mobile)
2. [Jest: o runner por baixo de tudo](#2-jest-o-runner-por-baixo-de-tudo)
3. [React Native Testing Library: testar como o usuário usa](#3-react-native-testing-library-testar-como-o-usuário-usa)
4. [Interação: `fireEvent` vs. `userEvent`, e fake timers](#4-interação-fireevent-vs-userevent-e-fake-timers)
5. [Render customizado: injetando os mesmos Providers da produção](#5-render-customizado-injetando-os-mesmos-providers-da-produção)
6. [Testando hooks e mocks com Jest](#6-testando-hooks-e-mocks-com-jest)
7. [Cobertura de código: o que o número não diz](#7-cobertura-de-código-o-que-o-número-não-diz)
8. [Teste de componente real: formulário, estilo e erro](#8-teste-de-componente-real-formulário-estilo-e-erro)
9. [Testes de integração: telas inteiras via Expo Router](#9-testes-de-integração-telas-inteiras-via-expo-router)
10. [Mockando o Repository: erro, loading e dados](#10-mockando-o-repository-erro-loading-e-dados)
11. [Mocks globais](#11-mocks-globais)
12. [Snapshot testing](#12-snapshot-testing)
13. [Mapa aula → conceito](#13-mapa-aula--conceito)
14. [Glossário](#glossário)

---

## 1. Fundamentos: a pirâmide de testes em mobile

**Três camadas, granularidades diferentes, cada uma paga um tipo de confiança diferente:**

| Camada | O que exercita | Velocidade | Ferramenta típica em RN |
|---|---|---|---|
| Unitário | Uma função/hook/componente isolado | Muito rápido (ms) | Jest |
| Integração | Vários componentes/hooks juntos, simulando uma tela inteira | Rápido (ainda em Node, sem device) | Jest + React Native Testing Library (RNTL) |
| E2E | O app de verdade, rodando num simulador/device | Lento (segundos a minutos) | Detox, Maestro — **fora do escopo deste módulo** |

O módulo cobre unitário e integração — as duas camadas de baixo da pirâmide, que rodam em Node (sem simulador, sem device) e por isso são o que se roda em CI a cada commit. E2E é outra ferramenta, outro processo, geralmente reservado pra poucos fluxos críticos, e não aparece nas aulas listadas.

### O princípio que guia RNTL, e que vale entender antes de ver a primeira query

> "Quanto mais seu teste se parece com a forma como o software é usado, mais confiança ele te dá." — princípio da família Testing Library (Kent C. Dodds), o mesmo em React (web), React Native e Vue.

Na prática: testar **o que aparece na tela e o que o usuário consegue fazer** (texto visível, campo preenchível, botão pressionável) — nunca o estado interno de um componente (`wrapper.state()`, `instance()`), porque estado interno muda com refatoração mesmo quando o comportamento não muda, e o teste quebra por um motivo errado. Esse princípio único explica quase todas as decisões de API do RNTL que as próximas aulas vão mostrar (queries por texto/role/label, não por classe interna).

### Por que este projeto especificamente está pronto pra ser testado

As duas aulas anteriores não foram só sobre arquitetura — foram, na prática, uma preparação pra este módulo. O motivo:

```ts
// useCityFindAll não importa Supabase nem AsyncStorage — importa uma abstração
export function useCityFindAll(filters: CityFindAllFilters) {
  const { city } = useRepository(); // injetado via Context
  return useAppQuery(() => city.findAll(filters));
}
```

Porque `useCityFindAll`, `useAuthSignIn` e companhia dependem de `useRepository()` (uma interface injetada via Context), um teste pode envolver o componente no **mesmo** `RepositoryProvider` usado em produção, só que com um repositório fake em vez do `SupabaseCityRepository` real — sem rede, sem banco, determinístico, rápido. Essa é exatamente a promessa feita lá no módulo de arquitetura ("Repository facilita teste, mas por causa do DIP, não por mágica") — agora é a hora de cobrar essa dívida. Vale reler a seção 3 do `arquitetura-frontend.md` com essa lente: cada porta (`Repositories`, `IFeedbackService`, `IStorage`, `IAuthRepository`) construída nos dois módulos anteriores é um ponto onde este módulo vai plugar uma implementação fake.

**Consequência prática pra guardar:** um componente/hook que importa uma implementação concreta direto (sem passar por uma interface injetada) é mais difícil de testar sem rede/mock manual de módulo (`jest.mock` no arquivo inteiro). Um componente que só depende de uma abstração injetada é testável trocando o `value` do Provider — o mesmo mecanismo do Composition Root, agora usado a favor do teste em vez da produção.

## 2. Jest: o runner por baixo de tudo

*(a preencher — configuração do Jest neste projeto Expo, primeiro teste.)*

## 3. React Native Testing Library: testar como o usuário usa

*(a preencher — `render`, queries por texto/role/testID, por que evitar `testID` como primeira escolha.)*

## 4. Interação: `fireEvent` vs. `userEvent`, e fake timers

*(a preencher — diferença entre disparar um evento sintético (`fireEvent`) e simular a sequência real de eventos de um usuário (`userEvent`); por que `debounce`/temporizadores exigem fake timers em teste.)*

## 5. Render customizado: injetando os mesmos Providers da produção

*(a preencher — um `render` de teste que já embrulha `RepositoryProvider`/`FeedbackProvider`/`AuthProvider`/`StorageProvider`, pra não repetir isso em todo arquivo de teste.)*

## 6. Testando hooks e mocks com Jest

*(a preencher — `renderHook`, `jest.fn()`/`jest.mock()`, quando mockar um módulo inteiro vs. trocar só o adapter via Provider.)*

## 7. Cobertura de código: o que o número não diz

*(a preencher — coverage mede linhas executadas, não corretude; 100% de cobertura com asserts fracos ainda esconde bug.)*

## 8. Teste de componente real: formulário, estilo e erro

*(a preencher — `SignUpForm` sob teste: preencher campos, disparar validação do Zod, checar mensagem de erro renderizada.)*

## 9. Testes de integração: telas inteiras via Expo Router

*(a preencher — testar navegação de verdade entre `sign-in`/Home/`city-details`, não só um componente isolado.)*

## 10. Mockando o Repository: erro, loading e dados

*(a preencher — repositório fake que retorna erro/demora de propósito, pra testar os estados que a UI trata mas que são difíceis de forçar num backend real.)*

## 11. Mocks globais

*(a preencher — mocks que valem pro projeto inteiro, configurados uma vez (ex.: `jest.setup.js`), em vez de repetidos por arquivo de teste.)*

## 12. Snapshot testing

*(a preencher — quando um snapshot ajuda (evitar regressão visual não intencional) e quando vira ruído (snapshot gigante que ninguém revisa de verdade antes de aceitar).)*

---

## 13. Mapa aula → conceito

| Aula | Conceito principal | Seção |
|---|---|---|
| 1 | Pirâmide de testes, filosofia RNTL, por que a arquitetura anterior importa | §1 |
| 2 | Configuração e primeiro teste com Jest | §2 |
| 3-4 | Primeiro teste com RNTL, `fireEvent`, queries | §3, §4 |
| 5 | `userEvent`, fake timers | §4 |
| 6 | Render customizado | §5 |
| 7 | Teste de hook, Jest mocks | §6 |
| 8 | Code coverage | §7 |
| 9-10 | `SignUpForm`, estilo, cenários de erro | §8 |
| 11 | Integração com Expo Router | §9 |
| 12-14 | Integração: sign-in/out, Home, City Details | §9 |
| 15 | Erro, loading, mock de Repository | §10 |
| 16 | Mocks globais | §11 |
| 17 | Snapshot | §12 |

## Glossário

- **Pirâmide de testes:** muitos testes unitários (rápidos, isolados), menos testes de integração, poucos E2E (lentos, mais realistas) — a proporção inversa do custo de execução.
- **"Testar como o usuário usa":** princípio da Testing Library — consultar a UI pelo que é visível/interagível (texto, role, label), nunca pelo estado interno de implementação.
- **Repository fake em teste:** a mesma peça de Ports & Adapters usada em produção (in-memory) reaproveitada como test double — não é uma ferramenta de teste especial, é o mesmo adapter.
