# Arquitetura Front-end — Notas de Estudo

> Documento de **revisão**, não um tratado. Acompanha o módulo "Arquitetura e Padrões de Projeto" do curso, do início (aula 1) ao fim (aula 15, FeedbackService). Cada seção é o essencial de uma aula, comparado com o código real deste repositório — objetivo é reler rápido antes de aplicar o padrão em outro projeto, não reconstruir a aula inteira.

## Índice

1. [Introdução à Arquitetura](#1-introdução-à-arquitetura)
2. [Domínio, Casos de Uso e SRP](#2-domínio-casos-de-uso-e-srp)
3. [Padrão Repository](#3-padrão-repository)
4. [SOLID — Inversão de Dependência (DIP)](#4-solid--inversão-de-dependência-dip)
5. [City / Category — Repository replicado](#5-6-city--category--repository-replicado)
6. [Supabase Repositories — Composition Root em ação](#7-supabase-repositories--composition-root-em-ação)
7. [CQS e CQRS](#8-cqs-e-cqrs)
8. [Camada de UI (pasta `ui/`)](#9-camada-de-ui-pasta-ui)
9. [Pasta Utils](#10-pasta-utils)
10. [Tela de Sign-in Básica](#11-tela-de-sign-in-básica)
11. [Auth — Interfaces e In-Memory Adapter](#12-auth--interfaces-e-in-memory-adapter)
12. [Padrão Command (Mutations)](#13-padrão-command-mutations)
13. [UI como Reflexão Tardia](#14-ui-como-reflexão-tardia)
14. [FeedbackService — Revisão Final](#15-feedbackservice--revisando-a-arquitetura)
15. [Comparações rápidas](#comparações-rápidas)
16. [Leituras complementares](#leituras-complementares)
17. [Prática — projetos para aplicar](#prática--projetos-para-aplicar)
18. [Glossário](#glossário)

---

## 1. Introdução à Arquitetura

Arquitetura é sobre **onde uma decisão pode mudar sem quebrar o resto do app**: trocar de backend, testar sem rede, impedir que a tela saiba demais sobre *como* o dado chega.

```
Domínio (src/domain/**)             → entidades + contratos, sem dependência de framework
   ↑
Casos de uso (src/domain/**/useCases) → "o que" o app faz
   ↑
Repository (interface no domínio)   → contrato de acesso a dados
   ↑
Adapter (src/infra/**)              → in-memory, Supabase... (o "como")
   ↑
Composition Root (app/_layout.tsx)  → escolhe a implementação e injeta via Context
   ↑
UI (src/ui/**, app/**)              → camada mais externa, mais descartável
```

**Regra de ouro:** dependências apontam sempre "para dentro" — a UI depende do domínio, nunca o contrário.

## 2. Domínio, Casos de Uso e SRP

- **Domínio** = tipo + contrato de repositório por entidade, em `src/domain/<entidade>/` (`City.ts` + `ICityRepository.ts`, `Category.ts` + `ICategoryRepository.ts`, `Auth/AuthUser.ts` + `Auth/IAuthRepository.ts`). Zero dependência de React/Supabase.
- **Caso de uso** = um hook por operação, em `useCases/` (`useCityFindAll`, `useCityFindById`, `useGetRelatedCities`, `useCategoryFindAll`). Cada um só orquestra `useRepository()` + o hook de query:

```ts
export function useCityFindById(id: string) {
  const { city } = useRepository();
  return useAppQuery(() => city.findById(id));
}
```

- **Por que um hook por operação (SRP):** cada um tem uma única razão para mudar e é testável isolado, em troca de mais arquivos pequenos — trade-off aceitável na maioria dos projetos, mas não uma regra absoluta (times/domínios pequenos podem preferir um hook mais genérico).

## 3. Padrão Repository

**Status: implementado para as três entidades do app** — `City`, `Category` e `Auth` (seção 12), cada uma com um contrato (`I*Repository`) e ao menos um adapter concreto.

**Definição (Fowler):** Repository se comporta como uma coleção em memória de objetos de domínio — o cliente monta a query declarativamente (`findAll({ name, categoryId })`) e o repository resolve *como*, seja com `.filter()` num array ou um `.ilike()` no banco.

**Regras práticas, agnósticas de projeto:**
- **Um repository por Aggregate Root, nunca por tabela.** `City` é o aggregate aqui (carrega `TouristAttraction[]`/`Category[]`); nunca criar `ITouristAttractionRepository` à parte.
- **Mapper é condicional, não obrigatório.** `InMemoryCityRepository` não converte nada — os dados já nascem no formato do domínio. `SupabaseCityRepository` precisa de `supabaseAdapter` porque o formato do banco diverge do domínio. A regra: só existe Mapper quando a fonte de dados difere do shape do domínio.
- **Repository não é obrigatório.** Ele existe para reduzir acoplamento e ganhar testabilidade — em arquiteturas fortemente CQRS, times às vezes abrem mão dele (crítica conhecida de Jimmy Bogard). Não é um objetivo em si.

## 4. SOLID — Inversão de Dependência (DIP)

Casos de uso não devem depender de uma implementação concreta de repositório — os dois devem depender de uma interface. O projeto passou por duas versões:

| | v1 — parâmetro | v2 — Context (atual) |
|---|---|---|
| Quem escolhe a implementação | Cada chamador do caso de uso | Um único lugar (`app/_layout.tsx`) |
| Trocar in-memory → Supabase | Muda toda tela que instancia o repo | Muda o `value` de um `<RepositoryProvider>` |
| Acoplamento da UI | Tela conhece `InMemoryCityRepository` | Tela não conhece nenhuma implementação |

```tsx
// app/_layout.tsx — Composition Root
<RepositoryProvider value={InMemoryRepository}>...</RepositoryProvider>

// RepositoryProvider.tsx
export function useRepository(): Repositories {
  const context = React.use(RepositoryContext);
  if (!context) throw new Error("must be used within a RepositoryProvider");
  return context;
}
```

> **Bug ainda presente:** o valor default do `createContext` é `{} as Repositories` (truthy), então o `if (!context)` nunca dispara fora do Provider. A correção certa é `createContext<Repositories | undefined>(undefined)`. Foi anotada como comentário no código, mas não aplicada — lição à parte: **anotar a correção não é o mesmo que aplicá-la.**

## 5-6. City / Category — Repository replicado

Ambas implementadas ponta a ponta (in-memory e Supabase). Receita reaproveitável para qualquer entidade nova, em qualquer projeto:

1. **Domínio** — tipo + interface do repositório (`Category.ts` + `ICategoryRepository.ts`).
2. **Caso de uso** — um hook por operação do contrato.
3. **Adapter** — implementação concreta (classe ou objeto literal, ver seção 7).
4. **Registro** — adiciona o campo em `Repositories` e instancia nos composition roots (`InMemoryRepository`, `SupabaseRepositories`).
5. **Consumo** — troca qualquer acesso direto a dado cru pelo caso de uso novo.

## 7. Supabase Repositories — Composition Root em ação

**Status: concluído.** `SupabaseCityRepository`/`SupabaseCategoryRepository` implementam os contratos, e trocar toda a fonte de dados vira uma linha:

```diff
<RepositoryProvider
- value={InMemoryRepository}
+ value={SupabaseRepositories}
>
```

Isso é o pagamento da dívida da seção 4: o Composition Root só valia a pena quando existiam **duas** implementações reais para escolher.

**Nota agnóstica (TypeScript):** `InMemoryCityRepository` é uma `class`; `SupabaseCityRepository` é um objeto literal com funções. Os dois satisfazem `ICityRepository` porque TS usa **tipagem estrutural** — importa o formato, não se é classe ou objeto.

## 8. CQS e CQRS

| | CQS (Command-Query Separation) | CQRS (Command Query Responsibility Segregation) |
|---|---|---|
| Nível | Método/função | Arquitetura do sistema |
| Regra | Todo método é Query (lê) OU Command (efeito colateral), nunca os dois | Leitura e escrita podem ter modelos/armazenamentos separados |
| Autor | Bertrand Meyer | Greg Young |

CQRS é CQS "escalado" para a arquitetura inteira — não precisa de CQRS pra aplicar CQS.

**O que o projeto fez (CQS):** `useFetchData` virou `useAppQuery` (mesmo comportamento, nome novo) para declarar "isso aqui é só leitura" — e o par simétrico `useAppMutation` já existe (ver seção 13), fechando o par Query/Command. O mesmo princípio aparece em: **TanStack Query** (`useQuery`/`useMutation`) e **GraphQL** (tipos raiz `Query`/`Mutation` no schema).

**Dúvida real de nomenclatura:** `useCases/` guarda operação de *negócio* (`useCityFindAll`); `src/infra/operations/` guarda o primitivo *genérico* de CQS (`useAppQuery`), agnóstico de domínio. São "operações" em camadas diferentes — a palavra colide, o conceito não. Recomendação: nomear a pasta genérica pelo padrão que ela implementa (`infra/query/` ou `infra/cqs/`) em vez de reusar "operations", para cortar a ambiguidade.

## 9. Camada de UI (pasta `ui/`)

Refatoração mecânica: `src/components/`, `src/containers/` e `src/theme/` viraram `src/ui/components/`, `src/ui/containers/` e `src/ui/theme/`. Sem mudança de comportamento — só de endereço.

**Por que importa (agnóstico):** agora a árvore de pastas espelha 1:1 as três camadas do diagrama da seção 1 — `domain/`, `infra/`, `ui/` como pastas irmãs, cada uma com uma responsabilidade só. Uma boa arquitetura permite reorganizar a "casca" sem tocar em regra de negócio — é o que esse commit prova na prática.

## 10. Pasta Utils

`useDebounce` (hook genérico, sem relação com nenhuma entidade) moveu de `src/hooks/` para `src/utils/hooks/`.

**Critério agnóstico:** *util* é código reutilizável sem estado de domínio e sem depender de repositório/Context. Se depende de `useRepository()` ou de um tipo de domínio, é caso de uso — não util.

## 11. Tela de Sign-in Básica

Formulário com email/senha em estado local; `handleSignIn` hoje só faz `console.log`, sem tocar em repositório nenhum.

**Nota agnóstica:** é saudável construir a UI de uma feature antes de plugar a lógica real — desde que o domínio (seção 12) já exista independente da tela. É a essência da seção 14 (UI como reflexão tardia) aplicada na prática.

## 12. Auth — Interfaces e In-Memory Adapter

Mesma receita da seção 5-6, aplicada a Auth:

```ts
// src/domain/Auth/IAuthRepository.ts
export interface IAuthRepository {
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signOut: () => Promise<void>;
}

// src/infra/repositories/adapters/inMemory/inMemoryAuthRepository.ts
export class inMemoryAuthRepository implements IAuthRepository {
  async signIn(email: string, password: string): Promise<AuthUser> {
    const user = authUsers.find((user) => user.email === email);
    if (user) return user;
    throw new Error("user not found");
  }
  async signOut(): Promise<void> {}
}
```

Repare que `signIn` **ignora a senha de propósito** — é um adapter fake, só o suficiente para desbloquear a UI, no mesmo espírito do primeiro `InMemoryCityRepository`.

**Insight agnóstico — composition root não é tudo-ou-nada:** em `SupabaseRepositories`, o campo `auth` continua usando `inMemoryAuthRepository` (`// TODO: substituir por Supabase Auth`), enquanto `city`/`category` já usam Supabase. Um composition root pode misturar adapters de fontes diferentes por entidade — não precisa trocar tudo de uma vez.

**Dois pontos de atenção:**
- `inMemoryAuthRepository` está em camelCase; as outras classes do projeto (`InMemoryCityRepository`, `InMemoryCategoryRepository`) usam PascalCase — inconsistência pequena, vale padronizar.
- O bug da seção 4 (`if (isSignedIn)` invertido em `app/(protected)/_layout.tsx`) **foi corrigido** para `if (!isSignedIn)`. Mas `isSignedIn` continua uma constante fixa em `false` — a tela de sign-in já chama `auth.signIn` de verdade (seção 13), só falta esse resultado virar estado de sessão que o gate de rota consulte.

## 13. Padrão Command (Mutations)

**Status: implementado**, como o par simétrico de `useAppQuery` (seção 8) — não uma classe `Command` com `.execute()`, mas o **padrão Mutation** (mesmo espírito do Command: encapsular uma escrita como unidade isolada, decidida fora da UI; nome e forma vêm de GraphQL/TanStack Query).

```ts
// src/infra/operations/useAppMutation.ts — primitivo genérico, agnóstico de domínio
export function useAppMutation<TData, TVariables>({
  mutateFn, onSuccess, onError,
}: UseAppMutationParams<TData, TVariables>) {
  const [isLoading, setIsLoading] = useState(true); // ver bug abaixo
  const [error, setError] = useState<unknown>(null);

  async function mutate(variables: TVariables) {
    try {
      setIsLoading(true);
      setError(null);
      const data = await mutateFn(variables);
      onSuccess?.(data);
    } catch (error) {
      onError?.(error);
      setError(error);
    } finally {
      setIsLoading(false);
    }
  }

  return { mutate, isLoading, error };
}

// src/domain/Auth/operations/useAuthSignIn.ts — caso de uso específico, por cima do primitivo
export function useAuthSignIn() {
  const { auth } = useRepository();
  return useAppMutation<AuthUser, { email: string; password: string }>({
    mutateFn: ({ email, password }) => auth.signIn(email, password),
    onSuccess: (authUser) => console.log("success:", authUser.id),
  });
}
```

A tela (`app/sign-in.tsx`) só chama `const { mutate } = useAuthSignIn()` e depois `mutate({ email, password })` — não conhece `IAuthRepository` nem o adapter por trás.

> **Bug:** `isLoading` começa em `useState(true)`, então a mutation nasce "carregando" antes mesmo do usuário clicar em Entrar — só faz sentido pra `useAppQuery` (que dispara sozinho no mount); numa mutation, o estado inicial correto é `false`.

**Sobre a nomenclatura (retomando a seção 8):** `useAuthSignIn` ficou em `Auth/operations/`, não em `Auth/useCases/` como `City`/`Category`. Ou seja, "operations" no vocabulário do professor não é só o primitivo genérico de CQS — é também onde casos de uso (de leitura ou escrita) moram. É uma pista de que a distinção `useCases/` vs. `operations/` sugerida na seção 8 não é universal; cada projeto define seu próprio vocabulário, e o importante é ser consistente dentro do mesmo projeto (aqui, `city`/`category` usam `useCases/` e `Auth` usa `operations/` — vale unificar).

**Sobre trocar por TanStack Query depois (o motivo de `useAppMutation` imitar a API dele):** como `useAuthSignIn` só conhece a *forma* de `useAppMutation` (`{ mutate, isLoading, error }`), trocar a implementação por trás — de um hook artesanal para `useMutation` de verdade — é uma troca de adapter, não uma reescrita de caso de uso ou tela. É o mesmo benefício de DIP (seção 4) e Composition Root (seção 7), aplicado agora no nível do hook de dado, não só no nível do repositório.

## 14. UI como Reflexão Tardia

Domínio, casos de uso e repositórios devem ser desenháveis e testáveis **sem** decidir a tela — a UI é a camada mais externa, plugada por último. `useCityFindAll` não sabe nada sobre React Native; a tela só consome o resultado. Onde o projeto ainda foge disso: containers como `CityDetailsMap`/`CityFilter` ainda misturam busca de dado e apresentação no mesmo arquivo.

## 15. FeedbackService — Revisando a Arquitetura

**Status: implementado.** Último caso de uso do módulo, e o mais importante para revisão: o mesmo problema das seções anteriores, mas aplicado a uma dependência que não é "buscar dado" — como avisar o usuário de sucesso/erro sem a UI saber qual mecanismo está por trás (Alert nativo, toast, log).

```ts
// src/infra/services/feedback/IFeedbackService.ts
export interface IFeedbackService {
  send: (feedback: { type: "success" | "error"; message: string; description?: string }) => void;
}
```

Dois adapters prontos — `AlertFeedback` (`Alert.alert` do RN) e `ConsoleFeedback` (log colorido) — registrados via Context, exatamente como `Repositories`. O Composition Root agora injeta **duas** dependências independentes:

```tsx
// app/_layout.tsx
<FeedbackProvider value={AlertFeedback}>
  <RepositoryProvider value={InMemoryRepository}>...</RepositoryProvider>
</FeedbackProvider>
```

E `useAuthSignIn` passou a depender de duas abstrações, cada uma trocável por conta própria:

```ts
export function useAuthSignIn() {
  const { auth } = useRepository();
  const feedbackService = useFeedbackService();
  return useAppMutation({
    mutateFn: ({ email, password }) => auth.signIn(email, password),
    onSuccess: (authUser) =>
      feedbackService.send({ type: "success", message: `signed in: ${authUser.email}` }),
    onError: () => feedbackService.send({ type: "error", message: "error on sign" }),
  });
}
```

**A revisão da arquitetura, em uma frase:** Interface → Adapter → Context não é exclusivo de "repositório de dados" — é a receita genérica para qualquer capacidade que o app precisa sem saber *como* é implementada. Repository resolve "como buscar dado"; FeedbackService resolve "como avisar o usuário"; o próximo poderia ser `IAnalyticsService`, `ILogger` — mesma receita. Esse padrão geral (interface = **porta**, implementação concreta = **adapter**) tem nome próprio na literatura: **Ports & Adapters / Arquitetura Hexagonal** (Cockburn) — ver glossário.

**Vale registrar como ponto de discussão:** diferente de `ICityRepository`/`IAuthRepository` (em `src/domain/`), `IFeedbackService` mora em `src/infra/services/`. Quebra a regra de ouro da seção 1? Depende do olhar — é discutível se "avisar o usuário" é regra de negócio ou detalhe de UI. Não há resposta universal; o importante é decidir isso conscientemente em cada projeto, não por acidente.

**O mesmo bug do Context, de novo:** `FeedbackContext = createContext<IFeedbackService>({} as IFeedbackService)` repete, literalmente, o bug da seção 4 — `{}` é truthy, o `if (!context)` nunca dispara, e o comentário de correção foi colado sem aplicar a correção, de novo. Um padrão que se repete duas vezes deixa de ser acaso: vale virar um item de checklist de code review, não só uma nota de rodapé.

Com isso fecha o módulo — ver [Prática](#prática--projetos-para-aplicar) para aplicar a receita completa (domínio, repository, DIP, CQS/Command, e agora services genéricos) em um projeto novo, do zero.

---

## Comparações rápidas

| Padrão | Problema que resolve | Estado neste projeto |
|---|---|---|
| Repository | Isola UI/casos de uso da fonte de dados | Implementado para `City`, `Category`, `Auth` |
| SRP em casos de uso | Um hook = uma responsabilidade | `useCityFindAll`, `useCityFindById`, `useGetRelatedCities`, `useCategoryFindAll` |
| DIP + Composition Root | Trocar implementação sem tocar em UI | `app/_layout.tsx` troca `InMemoryRepository` ↔ `SupabaseRepositories` numa linha |
| Mapper condicional | Converter formato cru → domínio, só quando preciso | Supabase precisa (`supabaseAdapter`); in-memory não |
| CQS | Nomear métodos como Query xor Command | Implementado: `useAppQuery` (leitura) e `useAppMutation` (escrita) |
| CQRS | Separar leitura/escrita na arquitetura | Nível de método resolvido (CQS); nenhuma segregação de armazenamento |
| Command / Mutation | Escrita como unidade isolada, fora da UI | Implementado (`useAuthSignIn` via `useAppMutation`); troca futura por TanStack Query é só de adapter |
| Adapters mistos no mesmo composition root | Migrar entidade por entidade, não tudo de uma vez | `SupabaseRepositories.auth` ainda é in-memory |
| Ports & Adapters (genérico) | Aplicar Interface→Adapter→Context além de repositório de dados | `IFeedbackService` (`AlertFeedback`/`ConsoleFeedback`) injetado do mesmo jeito que `Repositories` |

## Leituras complementares

- **Martin Fowler — [Repository](https://martinfowler.com/eaaCatalog/repository.html)** — definição canônica do padrão.
- **Microsoft Learn — [Designing the infrastructure persistence layer](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design)** — Repository em DDD: aggregate root, DAO vs. Repository, Unit of Work, e quando *não* usar.

Vale revisitar os dois sempre que a pergunta for "vale a pena um Repository aqui?" em outro projeto.

## Prática — projetos para aplicar

Quatro projetos pequenos, em ordem crescente de complexidade, para treinar os mesmos padrões em código novo (sem copiar deste app):

**1. Lista de tarefas com dois backends**
Objetivo: sentir o valor do DIP na prática. Um Todo app com `ITaskRepository`, um adapter `InMemory`/`AsyncStorage` e um adapter real (Firebase, Supabase ou uma API própria).
Praticar: Repository, Composition Root via Context, um hook por caso de uso (`useTaskFindAll`, `useTaskCreate`), CQS (`useAppQuery` para leitura, um `useAppMutation` de verdade para criar/concluir tarefa).
Primeiro passo: escrever `ITaskRepository` e o adapter in-memory antes de tocar em qualquer tela.

**2. Controle de gastos pessoais**
Objetivo: lidar com um Aggregate Root real. Uma "Conta" que agrega várias "Transações", com saldo calculado.
Praticar: Aggregate Root (um repository só para `Conta`, nunca um para `Transacao` isolada), Auth com interface + in-memory + provedor real depois, e um recorte simples de CQRS (endpoint/consulta de "resumo do mês" separado da lista de transações).
Primeiro passo: modelar o domínio (`Conta`, `Transacao`, regra de saldo) sem nenhuma UI.

**3. Mini e-commerce (catálogo + carrinho)**
Objetivo: múltiplos aggregates interagindo (`Produto`, `Carrinho`, `Pedido`) e uma mutação de verdade.
Praticar: Command pattern no checkout (`CheckoutCommand`), testes de caso de uso com um repositório mock (validando a promessa "Repository facilita teste"), e uma versão simples do FeedbackService (aula 15) notificando sucesso/erro do pedido.
Primeiro passo: escrever o `PlaceOrderCommand` e testá-lo com um `InMemoryOrderRepository`, antes de qualquer tela de carrinho.

**4. App de lembretes com múltiplos canais de envio**
Objetivo: praticar Ports & Adapters (seção 15) fora do contexto de dado — um `INotificationService` (`send`) com adapters reais (push local, e-mail, ou só um `ConsoleNotification` para dev), trocados via Context como o `IFeedbackService` daqui.
Praticar: um `IReminderRepository` (CRUD dos lembretes) junto de um `INotificationService` totalmente independente — dois "ports" injetados no mesmo caso de uso, cada um trocável sem afetar o outro.
Primeiro passo: escrever a interface `INotificationService` e dois adapters (`ConsoleNotification`, um real) antes de decidir qual biblioteca de push usar.

### Outras formas de potencializar o aprendizado (sem começar um projeto novo)

- **Trocar o backend deste próprio app** de Supabase para uma API própria (ou vice-versa), sem tocar em nenhuma tela — é o teste real de que o DIP aqui implementado vale a pena.
- **Escrever testes unitários** para um caso de uso (`useCityFindAll`, `useAuthSignIn`) usando um repositório mock, comprovando na prática a promessa "Repository facilita teste" (seção 3).
- **Pegar um projeto existente** (seu ou de terceiros) que misture UI e acesso a dado no mesmo arquivo, e refatorar *só* a camada de dados para Repository — sem mudar a UI. Bom exercício de arquitetura incremental, sem reescrever do zero.
- **Revisar código de outra pessoa** usando este documento como checklist: a interface está no lugar certo? o Context tem valor default seguro? existe mais de um adapter registrado, ou só um (sinal de que o desacoplamento ainda não foi testado de verdade)?

## Glossário

- **Domínio:** entidades e regras de negócio, sem dependência de framework. Ex.: `City`, `AuthUser`.
- **Caso de uso:** ação sobre o domínio, um hook por operação. Ex.: `useCityFindAll`.
- **Repository:** interface que abstrai acesso a dados de uma entidade, como uma coleção em memória (Fowler).
- **Aggregate Root (DDD):** entidade "porta de entrada" de um conjunto que muda junto e de forma consistente — um repository por aggregate, nunca por tabela.
- **Mapper:** converte o formato cru da fonte de dados para o domínio; só necessário quando os formatos divergem.
- **Adapter:** implementação concreta de uma interface para uma tecnologia específica.
- **Composition Root:** único ponto do app que escolhe as implementações concretas — aqui, o `<RepositoryProvider>`.
- **DIP:** o "D" de SOLID — dependa de abstrações, não de implementações.
- **SRP:** o "S" de SOLID — um módulo, um motivo para mudar.
- **CQS:** todo método é Query ou Command, nunca os dois (Bertrand Meyer).
- **CQRS:** a versão arquitetural do CQS — leitura e escrita podem ter modelos/armazenamentos separados (Greg Young).
- **Command Pattern:** encapsula uma escrita como objeto/função com `execute()`.
- **Structural typing (TS):** um valor satisfaz uma interface pelo formato, não por herança — classe ou objeto literal, tanto faz.
- **Ports & Adapters / Arquitetura Hexagonal (Cockburn):** nome geral do padrão Interface (porta) + implementação concreta (adapter) trocável por Context/DI — Repository e FeedbackService são duas instâncias da mesma ideia.
