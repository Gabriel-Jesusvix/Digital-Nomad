# Arquitetura Front-end — Notas de Estudo

> Documento vivo. Acompanha o módulo **"Arquitetura e Padrões de Projeto"** do curso, comparando os conceitos das aulas com o código real deste repositório. Cada vez que o código mudar (novo commit refatorando algo do módulo), peça para eu revisar os arquivos alterados e atualizar este documento com o "antes/depois" e o padrão aplicado.

## Índice

1. [Introdução à Arquitetura](#1-introdução-à-arquitetura)
2. [Domínio, Operações e Princípios](#2-domínio-operações-e-princípios)
3. [Padrão Repository](#3-padrão-repository)
4. [SOLID — Inversão de Dependência](#4-solid--inversão-de-dependência-dip)
5. [City / Category — Operações e Repository](#5-6-city--category--operações-e-repository)
6. [Padrão Supabase Repositories](#7-padrão-supabase-repositories)
7. [CQS e CQRS](#8-cqs-e-cqrs)
8. [Camada de UI (Refatoração)](#9-camada-de-ui-refatoração)
9. [Pasta Utils (Refatoração)](#10-pasta-utils-refatoração)
10. [Auth — Interfaces e In-Memory Adapter](#12-auth--interfaces-e-in-memory-adapter)
11. [Padrão Command (Mutations)](#13-padrão-command-mutations)
12. [UI como Reflexão Tardia](#14-ui-como-reflexão-tardia)
13. [FeedbackService — Revisão Final](#15-feedbackservice--revisando-a-arquitetura)
14. [Leituras complementares](#leituras-complementares)
15. [Glossário](#glossário)

---

## 1. Introdução à Arquitetura

Arquitetura de front-end não é sobre pastas bonitas — é sobre **onde uma decisão pode mudar sem quebrar o resto do app**. As perguntas que ela responde:

- Se eu trocar Supabase por outra API, quantos arquivos eu preciso tocar?
- Se eu quiser testar a lógica de busca de cidades sem rede, dá pra fazer isso hoje?
- Uma tela (`app/`) sabe demais sobre *como* os dados chegam, ou só sabe *o que* pedir?

Camadas que este projeto vem construindo ao longo do módulo (da mais interna/estável para a mais externa/volátil):

```
Domínio (src/domain/**)             → entidades + contratos (interfaces), sem dependência de framework
   ↑
Casos de uso (src/domain/**/useCases) → "o que" o app faz (buscar cidades, detalhes...)
   ↑
Repository (interface no domínio)   → contrato de acesso a dados, abstrato
   ↑
Adapter / Implementação (src/infra) → Supabase, in-memory... (o "como")
   ↑
Composition Root (app/_layout.tsx)  → escolhe QUAL implementação usar e injeta via Context
   ↑
UI (components/containers/app)      → a camada mais externa e mais descartável
```

**Regra de ouro:** dependências devem apontar sempre "para dentro" — a UI depende do domínio, nunca o contrário. O Supabase é detalhe de infraestrutura, não deveria "vazar" para dentro do domínio. Essa regra já está visível no nome das pastas: `src/domain/` (o quê) vs. `src/infra/` (como).

## 2. Domínio, Operações e Princípios

- **Domínio** = os tipos e regras de negócio do app, sem nenhuma dependência de React, Expo ou Supabase. Isso deixou de ser um único `src/types.ts` e virou uma pasta por entidade: [src/domain/city/City.ts](src/domain/city/City.ts) e [src/domain/category/Category.ts](src/domain/category/Category.ts). Cada entidade tem sua própria "fatia" de domínio.
- **Operações** (ou *casos de uso*) = as ações que o app precisa executar sobre o domínio. Agora elas moram em pastas `useCases/` dentro de cada entidade — ex.: [src/domain/city/useCases/useCityFindAll.ts](src/domain/city/useCases/useCityFindAll.ts), `useCityFindById.ts`, `useGetRelatedCities.ts`, `useCategoryFindAll.ts`. O nome do arquivo já é o nome do caso de uso (`useCityFindAll` = "buscar todas as cidades"), o que deixa explícito o vocabulário do negócio.
- **Cada entidade também define seu próprio contrato de repositório** ao lado do tipo: [src/domain/city/ICityRepository.ts](src/domain/city/ICityRepository.ts) e [src/domain/category/ICategoryRepository.ts](src/domain/category/ICategoryRepository.ts). Isso é a aplicação prática da seção 3.
- **Princípio central do módulo:** separar *o que* o app faz (entidade + caso de uso + contrato, tudo em `src/domain/`) de *como* ele faz (implementação concreta, em `src/infra/`). A estrutura de pastas atual já reflete essa separação — antes tudo (tipo + acesso a dado) vivia junto em `src/supabase/supabaseService.ts`.

### Princípio agnóstico: um hook por caso de uso (SRP)

*Notas gerais — vale para qualquer app React, com qualquer fonte de dados.* Repare que cada caso de uso deste projeto segue exatamente a mesma receita, e cada um faz **uma coisa só**:

```ts
export function useCityFindById(id: string) {
  const { city } = useRepository();
  return useAppQuery(() => city.findById(id));
}

export function useGetRelatedCities(id: string) {
  const { city } = useRepository();
  return useAppQuery(() => city.getRelatedCities(id));
}
```

Isso é o "S" de SOLID (Single Responsibility Principle) aplicado a hooks: em vez de um hook genérico tipo `useCity(action: "findAll" | "findById" | "related", params)` que decide internamente o que fazer, cada operação de negócio ganha seu próprio hook, pequeno e nomeado no vocabulário do domínio.

**Por que isso compensa a "explosão de arquivos":**
- Cada hook tem uma única razão para mudar (mudou a regra de "buscar por id"? só `useCityFindById` muda).
- Fica trivial saber, só pelo nome do import, o que uma tela está fazendo — sem abrir o hook para ver qual branch de `if/switch` vai rodar.
- Testar um caso de uso isolado não exige simular os outros comportamentos que um hook "genérico" teria.

**Trade-off honesto:** mais arquivos pequenos para navegar. Em times/projetos muito pequenos, ou operações que sempre mudam juntas, um hook mais genérico pode ser aceitável — de novo, arquitetura é sobre trade-offs, não sobre seguir a regra "mais granular = sempre melhor".

## 3. Padrão Repository

**Status: implementado no projeto para as duas entidades atuais** (`City` e, agora, também `Category` — ver seção 5-6).

O contrato vive no domínio, sem saber nada sobre a fonte de dados real:

```ts
// src/domain/city/ICityRepository.ts
export type CityFindAllFilters = {
  name?: string;
  categoryId?: string | null;
};

export interface ICityRepository {
  findAll(filters: CityFindAllFilters): Promise<CityPreview[]>;
  findById(id: string): Promise<City>;
  getRelatedCities(cityId: string): Promise<CityPreview[]>;
}
```

E a implementação concreta (hoje só existe a versão *in-memory*, usada para desenvolver a UI sem depender de rede) fica isolada em `src/infra/`:

```ts
// src/infra/repositories/adapters/inMemory/inMemoryCityRepository.ts
export class InMemoryCityRepository implements ICityRepository {
  async findAll(filters: CityFindAllFilters): Promise<CityPreview[]> {
    return cities; // dados locais de src/data/cities.ts
  }
  findById(id: string): Promise<City> {
    throw new Error("Method not implemented.");
  }
  getRelatedCities(cityId: string): Promise<CityPreview[]> {
    throw new Error("Method not implemented.");
  }
}
```

Repare que, na primeira versão, `findById` e `getRelatedCities` lançavam erro de propósito — é normal um adapter "in-memory" nascer incompleto, implementando só o suficiente para a tela que está sendo desenvolvida no momento (`findAll`, usado na Home). O contrato (`ICityRepository`) já obriga a assinatura dos três métodos, então o TypeScript lembra quando é hora de implementá-los de verdade — o que já aconteceu:

```ts
async findById(id: string): Promise<City> {
  const city = cities.find((city) => city.id === id);
  if (city) return city;
  throw new Error("City not found");
}

async findAll({ name, categoryId }: CityFindAllFilters): Promise<CityPreview[]> {
  let cityPreviewList = [...cities];
  if (name) {
    cityPreviewList = cityPreviewList.filter((city) =>
      city.name.toLowerCase().includes(name.toLowerCase())
    );
  }
  if (categoryId) {
    cityPreviewList = cityPreviewList.filter((city) =>
      city.categories.some((category) => category.id === categoryId)
    );
  }
  return cityPreviewList;
}
```

Isso é exatamente a citação de Fowler do início da seção em código: "clientes constroem queries declarativamente e as enviam ao repository" — quem chama `findAll({ name, categoryId })` não sabe (nem precisa saber) que a filtragem é um `.filter()` em um array em memória; amanhã, na versão Supabase, a mesma assinatura pode virar um `.ilike()` no banco, sem que nenhum caso de uso ou tela precise mudar.

### Adapter/Mapper é condicional, não obrigatório

*Nota agnóstica de projeto.* Repare que `InMemoryCityRepository` não faz **nenhuma conversão** de formato — os dados de `src/infra/repositories/adapters/inMemory/data/cities.ts` já nascem no formato do domínio (`City`/`CityPreview`), então o repository só filtra e retorna. Isso só é possível porque a fonte de dados foi escrita à mão, já no shape certo.

Uma fonte de dados externa (banco relacional, API REST, Supabase) quase nunca devolve o dado já no formato do domínio — vêm colunas em `snake_case`, tabelas separadas que precisam virar um objeto aninhado, campos que precisam de transformação (como montar uma URL de imagem a partir de um nome de arquivo). É aí que entra um **Mapper/Adapter** dentro da implementação do repository, convertendo a "forma crua" (DTO) para a entidade de domínio antes de devolver.

**Regra geral para qualquer projeto:** a necessidade de um Mapper depende da distância entre o formato da fonte de dados e o formato do domínio — não é uma etapa que todo Repository precisa ter. Um repository in-memory ou um repository sobre uma API já bem desenhada pode não precisar de nenhum; um repository sobre um banco legado ou uma API de terceiros quase sempre vai precisar.

**Ainda pendente:** existe um repositório Supabase (`src/infra/repositories/supabase/supabaseService.ts`) de uma aula anterior, com seu próprio mapper (`supabaseAdapter.ts`), mas ele ainda não implementa `ICityRepository` formalmente — é o assunto da aula 7 (Supabase Repositories).

### Aprofundando: a definição clássica (Martin Fowler)

*Notas gerais — válidas para qualquer projeto, não só este.* Fonte: [martinfowler.com/eaaCatalog/repository.html](https://martinfowler.com/eaaCatalog/repository.html), do catálogo do livro *Patterns of Enterprise Application Architecture*.

Fowler descreve Repository como algo que:

> "Media entre o domínio e as camadas de mapeamento de dados usando uma interface parecida com uma coleção para acessar objetos de domínio."

Ou seja: o Repository se comporta como se fosse **uma coleção de objetos em memória** (tipo um array/`Map`). O código de domínio "adiciona", "remove" e "consulta" objetos nessa coleção sem saber se por trás existe um banco SQL, uma API REST ou um arquivo local. Toda a lógica de *como* montar a query fica concentrada dentro do Repository — nunca espalhada pelo domínio.

**Quando vale a pena usar (segundo Fowler):**
- Domínio complexo, com muitas classes que precisam ser consultadas.
- Lógica de consulta pesada ou repetida em vários lugares do código.
- Você quer eliminar duplicação de código de acesso a dado.

**Quando pode ser exagero:** sistemas simples, com poucas entidades e queries triviais, podem não precisar dessa camada extra — é um trade-off (mais uma camada = mais indireção = mais arquivos para navegar), não uma regra obrigatória. Vale ter isso em mente antes de aplicar o padrão "porque sim" em qualquer projeto novo.

### Aprofundando: Repository em DDD / arquitetura de microsserviços (Microsoft .NET Docs)

*Notas gerais, com o vocabulário de Domain-Driven Design (DDD) — portável para qualquer stack, não só .NET.* Fonte: [learn.microsoft.com — Designing the infrastructure persistence layer](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design).

- **Um repository por Aggregate Root, nunca um por tabela.** *Aggregate Root* é o conceito de DDD para "a entidade que é a porta de entrada de um conjunto de objetos relacionados, responsável por manter as regras de consistência entre eles" — neste projeto, `City` é um bom candidato a aggregate root (ele "carrega" `TouristAttraction[]` e `Category[]`). A regra prática: se duas entidades sempre mudam juntas dentro da mesma transação, elas pertencem ao mesmo aggregate e devem ser manipuladas por um único repository — nunca criar `ITouristAttractionRepository` separado se `TouristAttraction` só existe dentro do contexto de uma `City`.
- **Repository vs. DAO/DAL clássico:** um DAO tradicional normalmente faz CRUD tabela-a-tabela, sem transação, com baixa abstração — código que chama o DAO fica fortemente acoplado a ele. Um Repository, por trabalhar com abstrações (interfaces) e no nível do aggregate (não da tabela), permite aplicar Decorator/Proxy por cima (ex.: um `CachedCityRepository` que embrulha o `SupabaseCityRepository` e adiciona cache, sem a camada de domínio perceber a diferença).
- **Repository + Unit of Work:** em bancos relacionais com transações (o mundo .NET/EF usa `DbContext`, que já implementa os dois padrões juntos), o Repository lida com "quais objetos" e o Unit of Work com "quando persistir tudo de uma vez, em uma transação". Isso é mais relevante para apps com múltiplas escritas coordenadas — vale ter em mente quando este projeto chegar em mutations (aula 13, Command).
- **Repository facilita teste, mas por causa do DIP, não por mágica.** A citação do artigo resume bem por que isso importa:
  > "É recomendado definir e colocar as interfaces de repository na camada de domínio, para que a camada de aplicação não dependa diretamente da camada de infraestrutura [...] isso permite implementar repositories mock que retornam dado falso em vez de dado real do banco."

  É exatamente o `InMemoryCityRepository` deste projeto — o mesmo raciocínio, independente da linguagem.
- **Contraponto importante — Repository não é obrigatório.** O próprio artigo cita Jimmy Bogard (autor do MediatR):
  > "Não sou muito fã de repositories, principalmente porque eles escondem detalhes importantes do mecanismo de persistência por baixo [...] Ao adotar CQRS, deixamos de precisar de repositories."

  Isso é uma visão real e válida na comunidade: se você já usa CQRS com queries diretas e otimizadas (SQL/ORM cru para leitura) e só usa o domínio para escrita, a camada de Repository pode virar uma abstração redundante. **Takeaway para qualquer projeto:** Repository é uma ferramenta para reduzir acoplamento e ganhar testabilidade — não é um objetivo em si. Use quando o custo da indireção compensa o ganho de desacoplamento; não use só porque "é o padrão certo".

## 4. SOLID — Inversão de Dependência (DIP)

O princípio: módulos de alto nível (casos de uso) não devem depender de módulos de baixo nível (uma implementação concreta de repositório); os dois devem depender de uma abstração (interface). O projeto já passou por **duas versões** desse princípio nas últimas aulas — vale comparar as duas.

### Versão 1 — injeção manual via parâmetro

Nesta versão, quem chamava o caso de uso era responsável por "montar" e passar a implementação:

```ts
// useCityFindAll recebia o repositório como argumento
export function useCityFindAll(filters: CityFindAllFilters, repository: ICityRepository) {
  return useAppQuery(() => repository.findAll(filters), [...]);
}

// e a tela precisava saber QUAL implementação instanciar
useCityFindAll({ name, categoryId }, new InMemoryCityRepository());
```

Isso já respeita o DIP (`useCityFindAll` depende de `ICityRepository`, a interface, não de uma classe concreta específica) — mas empurra a responsabilidade de "escolher a implementação" para **cada tela que usa o caso de uso**. Se dez telas usam cidades, dez telas precisam saber instanciar `InMemoryCityRepository` (ou trocar para `SupabaseCityRepository`).

### Versão 2 — injeção via React Context (estado atual)

Agora existe um **Composition Root** único — o lugar onde o app decide, uma única vez, qual implementação concreta usar — montado em [app/_layout.tsx](app/_layout.tsx):

```tsx
// app/_layout.tsx
<RepositoryProvider value={InMemoryRepository}>
  <ThemeProvider theme={theme}>
    <Stack>...</Stack>
  </ThemeProvider>
</RepositoryProvider>
```

`Repositories` é o "catálogo" de todos os repositórios do app — hoje só tem `city`, com `category` já reservado no tipo:

```ts
// src/domain/Repositories.ts
export type Repositories = {
  city: ICityRepository;
  // category: ICategoryRepo
};
```

`InMemoryRepository` é uma implementação concreta desse catálogo:

```ts
// src/infra/repositories/adapters/inMemory/index.ts
export const InMemoryRepository: Repositories = {
  city: new InMemoryCityRepository(),
};
```

E o Context + hook de acesso, usando a nova API `React.use` do React 19:

```tsx
// src/infra/repositories/RepositoryProvider.tsx
export const RepositoryContext = React.createContext<Repositories>({} as Repositories);
export const RepositoryProvider = RepositoryContext.Provider;

export function useRepository(): Repositories {
  const context = React.use(RepositoryContext);
  if (!context) {
    throw new Error("Repository Context should be used within a RepositoryProvider");
  }
  return context;
}
```

O caso de uso deixa de receber o repositório por parâmetro e passa a puxá-lo do Context:

```ts
// src/domain/city/useCases/useCityFindAll.ts
export function useCityFindAll(filters: CityFindAllFilters) {
  const { city } = useRepository();
  return useAppQuery(() => city.findAll(filters), [filters.name, filters.categoryId]);
}
```

**Comparação direta:**

| | Versão 1 (parâmetro) | Versão 2 (Context) |
|---|---|---|
| Quem escolhe a implementação | Cada chamador do caso de uso | Um único lugar (`app/_layout.tsx`) |
| Troca de implementação (in-memory → Supabase) | Precisa mudar toda tela que instancia o repositório | Muda o `value` de um único `<RepositoryProvider>` |
| Assinatura do hook | Recebe `repository` como argumento extra | Só recebe os filtros — mais limpa |
| Acoplamento da UI | A tela sabe que `InMemoryCityRepository` existe | A tela não sabe nada sobre implementações concretas |

Isso é a essência do DIP combinado com **Dependency Injection**: a interface (`ICityRepository`) mora no domínio; quem decide a implementação concreta é a borda do app (`app/_layout.tsx`), não o meio (casos de uso) nem o topo (telas).

> **Cuidado — pegadinha encontrada no código atual:** o valor padrão do Context é `{} as Repositories` (um objeto vazio, mas "forçado" via cast a parecer um `Repositories` válido). Como `{}` é um valor *truthy* em JavaScript, a checagem `if (!context) throw ...` dentro de `useRepository()` **nunca vai disparar**, mesmo se alguém usar `useRepository()` fora de um `<RepositoryProvider>`. Nesse caso, em vez do erro explicativo "should be used within a RepositoryProvider", o bug vira um `TypeError: Cannot read properties of undefined (reading 'findAll')` lá na frente, muito mais difícil de rastrear. Para a checagem funcionar de verdade, o valor padrão do `createContext` precisa ser `undefined`/`null`:
> ```ts
> export const RepositoryContext = React.createContext<Repositories | undefined>(undefined);
> // ...
> const context = React.use(RepositoryContext);
> if (!context) throw new Error(...); // agora dispara de verdade
> ```
> Esse é um erro comum ao implementar DI com Context: o valor "placeholder" passado pra satisfazer o TypeScript acaba escondendo a checagem em runtime que o padrão deveria garantir.
>
> **Atualização:** no commit seguinte, a correção foi anotada como comentário ao lado do `{} as Repositories`, mas o código em si não foi alterado — o default ainda é o objeto vazio, e a checagem `if (!context)` continua nunca disparando. Isso ilustra bem outro risco de qualquer checklist de arquitetura: **anotar a intenção de corrigir não é o mesmo que corrigir**. Vale revisar de novo quando a aula 7 (Supabase Repositories) mexer neste arquivo.

## 5-6. City / Category — Operações e Repository

- **City:** implementado ponta a ponta na versão in-memory, incluindo `findById` e `getRelatedCities` (que antes lançavam "not implemented", ver seção 3).
- **Category:** agora também implementado ponta a ponta — `ICategoryRepository` → `InMemoryCategoryRepository` → `useCategoryFindAll` → Context. `Repositories` já inclui os dois campos (`city` e `category`), e `InMemoryRepository` monta os dois adapters.

### Checklist agnóstico: replicando o Repository para uma nova entidade

Comparando como `City` e `Category` foram implementados, dá pra extrair uma receita reaproveitável em **qualquer projeto**, para qualquer entidade nova:

1. **Domínio** — crie o tipo da entidade (`Category.ts`) e o contrato do repositório ao lado (`ICategoryRepository.ts`), só com as operações que o app realmente precisa agora (aqui, só `findAll`).
2. **Casos de uso** — um hook/função por operação do contrato, puxando a implementação via injeção de dependência (`useCategoryFindAll` chama `useRepository().category.findAll()`).
3. **Adapter concreto** — implemente o contrato para a fonte de dados disponível (`InMemoryCategoryRepository`), reaproveitando dados já existentes quando possível.
4. **Registro no catálogo** — adicione o campo no tipo agregador (`Repositories`) e instancie o adapter no objeto de composição (`InMemoryRepository`).
5. **Consumo na UI** — troque qualquer acesso direto a dado "cru" (`useCategories` batendo direto numa lista local) pelo caso de uso novo.

Note que os passos 1-4 não dependem de nada específico deste projeto — é o mesmo roteiro para adicionar, por exemplo, um `IReviewRepository` num app de e-commerce, ou um `INotificationRepository` num app de mensagens.

## 7. Padrão Supabase Repositories

**Status: concluído.** `SupabaseCityRepository` e `SupabaseCategoryRepository` agora implementam formalmente `ICityRepository`/`ICategoryRepository`, e o app troca a implementação inteira — de dados locais para Supabase real — mudando **uma linha só**:

```tsx
// app/_layout.tsx
<RepositoryProvider
-  value={InMemoryRepository}
+  value={SupabaseRepositories}
>
```

Esse é o pagamento da dívida contraída lá na seção 4: o Composition Root existia, mas só tinha uma implementação para escolher. Agora, com duas implementações reais (`InMemoryRepository` e `SupabaseRepositories`) do mesmo contrato (`Repositories`), a troca é trivial e não toca em nenhum caso de uso, container ou tela — a prova concreta de que o DIP + Context estavam valendo a pena.

### Nota agnóstica: interface pode ser implementada por objeto, não só por classe

Repare que `InMemoryCityRepository` é uma **classe** (`class X implements ICityRepository`), mas `SupabaseCityRepository` é um **objeto literal** com funções:

```ts
async function findAll(filters: CityFilters): Promise<CityPreview[]> { /* ... */ }
async function findById(id: string): Promise<City> { /* ... */ }
async function getRelatedCities(cityId: string): Promise<CityPreview[]> { /* ... */ }

export const SupabaseCityRepository: ICityRepository = {
  findAll,
  findById,
  getRelatedCities,
};
```

Isso funciona porque o TypeScript usa **tipagem estrutural** (também chamada de *duck typing*): uma interface não exige uma classe específica, só exige que o valor tenha o **formato certo** (os mesmos métodos, com as mesmas assinaturas). Isso vale em qualquer projeto TypeScript, independente de framework: você pode misturar classes e objetos literais implementando a mesma interface, contanto que o formato bata. É uma escolha de estilo (orientado a objeto vs. funcional), não uma exigência do padrão Repository em si.

## 8. CQS e CQRS

Esta aula introduziu dois conceitos que têm nomes parecidos, mas atuam em **níveis diferentes** — vale distinguir bem os dois, porque essa confusão é comum em qualquer projeto/discussão de arquitetura:

| | CQS | CQRS |
|---|---|---|
| Nome completo | Command-Query Separation | Command Query Responsibility Segregation |
| Quem propôs | Bertrand Meyer (anos 80, ligado a Eiffel/Design by Contract) | Greg Young (2010) |
| Nível de aplicação | **Método/função** | **Arquitetura do sistema** |
| Regra | Todo método é uma *Query* (retorna dado, sem efeito colateral) OU um *Command* (causa efeito colateral, idealmente sem retornar dado relevante) — nunca os dois ao mesmo tempo | Leitura e escrita podem ter **modelos, caminhos de código e até armazenamentos totalmente separados** (ex.: banco otimizado para escrita + banco/cache otimizado para leitura) |
| Escala | Qualquer função/hook, em qualquer projeto | Sistemas onde leitura e escrita têm requisitos de performance/consistência muito diferentes (ex.: microsserviços de alto volume) |

**Relação entre os dois:** CQRS é CQS "escalado" para a arquitetura inteira. Você não precisa de CQRS para aplicar CQS — na real, CQS é uma boa prática básica que quase todo código deveria seguir; CQRS é uma decisão arquitetural mais pesada, com trade-offs de consistência (dado escrito pode demorar a aparecer no lado de leitura) que só compensam em cenários específicos.

### O que o projeto implementou agora: CQS, preparando o terreno para CQRS

O hook `useFetchData` foi renomeado para **`useAppQuery`** e movido para `src/infra/operations/useAppQuery.ts`. O comportamento não mudou — é o mesmo hook de sempre — mas o nome agora **declara uma intenção**: este hook serve só para **queries** (leitura). Isso é CQS em ação: ao nomear explicitamente "isso aqui é uma Query", o código já deixa reservado o espaço conceitual para um futuro `useAppMutation` (ou `useAppCommand`) — o par que vai lidar com escrita, com cuidados diferentes (loading distinto, invalidação de cache, feedback de sucesso/erro), que deve aparecer nas aulas 11 e 13 (Sign-in e Command).

```ts
// antes: nome genérico, não deixava explícito se era só pra leitura
// src/data/useFetchData.ts
export function useFetchData<DataT>(fetchData: () => Promise<DataT>, deps = []) { /* ... */ }

// depois: nome comunica a intenção (é uma Query, no sentido de CQS)
// src/infra/operations/useAppQuery.ts
export function useAppQuery<DataT>(fetchData: () => Promise<DataT>, deps = []) { /* ... */ }
```

**De onde vem essa inspiração (referências citadas em aula, todas agnósticas de framework):**
- **TanStack Query** (antigo React Query) batizou seus dois hooks principais exatamente assim: `useQuery` (leitura, com cache automático) e `useMutation` (escrita). A biblioteca inteira é uma implementação de CQS para o mundo de data-fetching em UI.
- **GraphQL** faz a mesma separação no nível do *schema*: toda API GraphQL declara um tipo raiz `Query` (leitura) e, separadamente, um tipo raiz `Mutation` (escrita) — nunca uma operação que faz as duas coisas.
- **CQRS**, como visto na tabela acima, é a versão "arquitetura de sistema inteiro" da mesma ideia.

O padrão se repete em escalas diferentes — de uma função (CQS), a uma biblioteca de front-end (TanStack Query), a uma spec de API (GraphQL), a uma arquitetura de microsserviço (CQRS). É um bom exemplo de como um princípio simples aparece disfarçado em várias ferramentas do dia a dia.

### A dúvida de nomenclatura: `operations/` vs. `useCases/`

Uma dúvida real e válida ao aplicar isso em qualquer projeto: o professor usa a pasta `operations/` para o `useAppQuery`, mas esse nome pode colidir com o vocabulário que a [seção 2](#2-domínio-operações-e-princípios) já usa para caso de uso ("operações do domínio"). Afinal, `useCityFindAll` também é uma "operação". São a mesma coisa?

**Não — são operações em camadas diferentes:**

- `src/domain/city/useCases/useCityFindAll.ts` = uma operação de **negócio**, específica deste domínio (só faz sentido neste app, ou em qualquer app que tenha o conceito de "cidade"). É o "Use Case"/"Interactor" da Clean Architecture: nomeado no vocabulário do negócio.
- `src/infra/operations/useAppQuery.ts` = um mecanismo **genérico e agnóstico de domínio**, que descreve *como* qualquer leitura assíncrona se comporta (estado de loading, erro, dado). Não sabe o que é uma "cidade" — poderia ser reusado em qualquer app, de qualquer domínio, sem mudar uma linha.

O nome "operations" aqui não se refere a "operações de negócio", mas sim à classificação CQS: "isso é uma operação do tipo Query" (em oposição a uma futura operação do tipo Command). É o mesmo problema de vocabulário que aparece na tabela CQS/CQRS acima — a palavra "operação" é genérica o suficiente pra significar coisas diferentes em camadas diferentes.

**Recomendação (uma escolha de projeto, não uma regra fixa) para evitar a ambiguidade no dia a dia:** manter `useCases/` só para operações de negócio (como já está) e, para a pasta que guarda os primitivos de CQS, preferir um nome que não reutilize a palavra "operação" — por exemplo `src/infra/query/` (espelhando o vocabulário do TanStack Query, já citado como inspiração) ou `src/infra/cqs/` (nomeando o padrão diretamente). Qualquer um dos dois deixa claro, só pelo caminho do import, que aquele hook é o primitivo genérico — e não mais um caso de uso do domínio. O importante, em qualquer projeto, não é qual nome exato se escolhe, mas que o time concorde e documente o que cada "operação" significa em cada camada.

Hoje só existem queries no projeto (`findAll`, `findById`, `getRelatedCities`) — nenhuma escrita ainda existe. Isso deve mudar a partir da aula 11 (Sign-in) e 13 (Command), quando o par `useAppMutation`/Command finalmente aparece.

## 9. Camada de UI (Refatoração)

*(placeholder — hoje `src/containers/` já separa seções "espertas" (ligadas a hooks de dados) de `src/components/` (puramente visuais), o que é uma boa base. Com o Context de repositórios já existente, o objetivo desta aula deve ser garantir que containers e telas dependam só de casos de uso (`useCityFindAll` etc.), nunca de `supabaseService`/`InMemoryCityRepository` diretamente — hoje ainda existem imports desses repositórios concretos esquecidos em telas como `app/(protected)/(tabs)/index.tsx`, que devem ser removidos por não serem mais necessários.)*

## 10. Pasta Utils (Refatoração)

*(placeholder — o projeto ainda não tem uma pasta `utils/`; hoje pequenas funções utilitárias como `useDebounce` ficam em `src/hooks/`. Atualizar aqui quando a pasta for criada e o critério de "o que é util vs. o que é hook" for definido em aula.)*

## 11. Tela de Sign-in Básica

*(placeholder — hoje `app/sign-in.tsx` é só um placeholder visual ("SIGN IN" na tela), e `app/(protected)/_layout.tsx` tem `isSignedIn = false` fixo no código, sem nenhuma lógica real de autenticação.)*

## 12. Auth — Interfaces e In-Memory Adapter

**Situação atual:**
```ts
// app/(protected)/_layout.tsx
const isSignedIn = false;
export default function ProtectedLayout() {
  if (isSignedIn) {
    return <Redirect href="/sign-in" />;
  }
  ...
}
```
(Note que a condição está invertida — hoje ela redireciona para `/sign-in` quando `isSignedIn` é `true`, o que é o oposto do que o nome sugere. Provavelmente vai ser corrigido junto com a implementação real de auth.)

**Padrão esperado (mesma ideia da seção 4, aplicada a Auth):** uma interface `IAuthRepository` (`signIn`, `signOut`, `getSession`) somando-se ao `Repositories` do Context, e, antes de plugar o Supabase Auth de verdade, um `InMemoryAuthRepository` que implementa o mesmo contrato guardando o "usuário logado" em memória — exatamente o mesmo caminho já percorrido para `city` na seção 4. Isso permite:
- Desenvolver e testar as telas de auth sem precisar de rede.
- Trocar `InMemoryAuthRepository` por um `SupabaseAuthRepository` depois, só mudando o `value` do `RepositoryProvider`.

```ts
export interface IAuthRepository {
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  getSession(): Promise<{ userId: string } | null>;
}

export class InMemoryAuthRepository implements IAuthRepository {
  private session: { userId: string } | null = null;
  async signIn(email: string) { this.session = { userId: email }; }
  async signOut() { this.session = null; }
  async getSession() { return this.session; }
}
```

## 13. Padrão Command (Mutations)

**Ideia:** encapsular uma operação de escrita em um objeto/função com uma responsabilidade única e um método `execute()`, em vez de espalhar chamadas como `supabase.auth.signInWithPassword(...)` direto dentro de componentes de UI.

```ts
export class SignInCommand {
  constructor(private authRepository: IAuthRepository) {}
  execute(email: string, password: string) {
    return this.authRepository.signIn(email, password);
  }
}
```

**Por que isso ajuda:**
- A tela só chama `signInCommand.execute(email, password)` — não sabe nada sobre Supabase.
- Fica fácil testar a lógica de negócio (validações, ordem de chamadas) sem montar a UI.
- Abre espaço para coisas como fila de comandos, log de auditoria, undo — sem tocar na UI.

Compare com **Query** (seção 8): uma query só lê e não deveria ter efeitos colaterais; um Command sempre causa uma mudança de estado observável.

## 14. UI como Reflexão Tardia

**Conceito ("UI as an afterthought"):** o domínio, os casos de uso e os repositórios devem ser desenháveis e testáveis **sem** decidir ainda qual será a tela, o design system ou até o framework de UI. A UI é a camada mais externa e a mais fácil de trocar — deveria ser "plugada" por último, não o ponto de partida do desenho.

**Onde o projeto já se aproxima disso:** `useCityFindAll` não sabe nada sobre React Native, Restyle ou como a lista de cidades vai ser desenhada — ele só orquestra domínio + repositório. A tela (`app/(protected)/(tabs)/index.tsx`) é só quem consome esse resultado e decide como renderizar. É esse o efeito prático de ter o Context de repositórios: a lógica de "como buscar cidades" existe e pode ser testada independente de qualquer componente visual.

**Onde ainda foge disso:** containers como `src/containers/CityDetailsMap.tsx` e `src/containers/CityFilter.tsx` ainda misturam, no mesmo arquivo, busca de dados e apresentação (JSX). O alerta desta aula é: a *lógica de negócio* (o que conta como "cidade relacionada", como um filtro é aplicado) não deveria morar dentro do JSX; deveria já estar pronta e testada na camada de casos de uso, e o container só a exibe.

## 15. FeedbackService — Revisando a Arquitetura

*(placeholder — última aula do módulo, revisita tudo. Bom lugar para, ao final, desenhar aqui o diagrama de camadas *real* do projeto (não o "ideal" das seções anteriores) e comparar com o diagrama da seção 1.)*

---

## Comparações rápidas

| Padrão | Problema que resolve | Estado neste projeto |
|---|---|---|
| Repository | Isola a UI/casos de uso da fonte de dados concreta | Implementado para `City` e `Category` (`ICityRepository`/`InMemoryCityRepository`, `ICategoryRepository`/`InMemoryCategoryRepository`) |
| SRP em casos de uso | Um hook = uma responsabilidade, fácil de nomear/testar isoladamente | Implementado: `useCityFindAll`, `useCityFindById`, `useGetRelatedCities`, `useCategoryFindAll` |
| DIP (SOLID) | Casos de uso não deveriam importar implementações concretas | Implementado via Context (`RepositoryProvider`/`useRepository`) — evoluiu de injeção manual por parâmetro para injeção via Context |
| Composition Root | Ter um único lugar que decide qual implementação concreta usar | Implementado em `app/_layout.tsx` (`<RepositoryProvider value={InMemoryRepository}>`) |
| Mapper/Adapter de dados | Converter o formato "cru" da fonte de dados para o domínio | Implementado para Supabase (`supabaseAdapter`); desnecessário no in-memory |
| Structural typing (TS) | Permitir que classe OU objeto literal satisfaçam a mesma interface | `InMemoryCityRepository` é classe, `SupabaseCityRepository` é objeto literal — os dois implementam `ICityRepository` |
| CQS | Cada método é OU uma leitura (query) OU uma escrita (command), nunca as duas | Implementado: `useAppQuery` batiza explicitamente o hook como "só leitura" |
| CQRS | Separar leitura de escrita na arquitetura inteira (não só no método) | Terreno preparado (nomenclatura CQS já aplicada); nenhuma separação de modelo/armazenamento ainda, nem escrita implementada |
| Command | Encapsular uma mutação como unidade testável | Ainda não existe nenhuma mutação no projeto |
| In-Memory Adapter | Testar/desenvolver sem depender da infraestrutura real | Implementado para `City` e `Category`; ainda não existe para Auth |
| Composition Root em uso real | Trocar toda a fonte de dados mudando uma linha | Feito: `app/_layout.tsx` trocou `InMemoryRepository` → `SupabaseRepositories` sem tocar em telas/casos de uso |

## Leituras complementares

Links indicados pelo professor nas aulas 3 e 4, com notas de estudo portáteis (não específicas deste projeto) já incorporadas nas seções acima:

- **Martin Fowler — [Repository](https://martinfowler.com/eaaCatalog/repository.html)** (catálogo de *Patterns of Enterprise Application Architecture*). A definição "canônica" do padrão: Repository como uma coleção de objetos de domínio em memória. Ver [seção 3](#3-padrão-repository).
- **Microsoft Learn — [Designing the infrastructure persistence layer](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-design)** (eBook .NET Microservices Architecture). Aplica Repository dentro de DDD: um repository por Aggregate Root, Repository vs. DAO, Repository + Unit of Work, e o contraponto de quando *não* usar Repository. Ver [seção 3](#3-padrão-repository).

Vale voltar nesses dois links sempre que for decidir "vale a pena um Repository aqui?" em qualquer projeto futuro — a resposta certa depende da complexidade do domínio, não é um padrão que se aplica cegamente.

## Glossário

- **Domínio (Domain):** entidades e regras de negócio, sem dependência de framework/infra. Ex.: `City` em `src/domain/city/City.ts`, `Category` em `src/domain/category/Category.ts`.
- **Caso de uso (Use Case) / Operação:** uma ação que o app executa sobre o domínio (buscar, filtrar, criar). Ex.: `useCityFindAll`.
- **Repository:** interface que abstrai o acesso a dados de uma entidade do domínio, escondendo a fonte real, e que se comporta como uma coleção em memória de objetos de domínio (Fowler). Ex.: `ICityRepository`.
- **Aggregate Root (DDD):** a entidade "porta de entrada" de um conjunto de objetos relacionados que precisam mudar juntos e de forma consistente (ex.: `City` + suas `TouristAttraction[]`). Regra prática: um Repository por Aggregate Root, nunca um por tabela.
- **DAO / DAL (Data Access Object / Layer):** padrão mais antigo e mais simples que Repository — geralmente CRUD direto tabela-a-tabela, sem abstração forte nem transação, resultando em mais acoplamento entre a lógica de negócio e o acesso a dados.
- **Unit of Work:** padrão que agrupa várias operações de escrita (insert/update/delete) em uma única transação, aplicada de uma vez só. Frequentemente usado junto com Repository (ex.: `DbContext` no Entity Framework implementa os dois).
- **Adapter:** implementação concreta de uma interface, conectando o domínio a uma tecnologia específica (Supabase, in-memory, REST...). Ex.: `InMemoryCityRepository`.
- **Mapper (ou DTO Mapper):** função/classe que converte o formato cru vindo da fonte de dados (linha de banco, resposta de API) para o tipo de domínio. Só é necessário quando os dois formatos divergem — não é uma peça obrigatória de todo Repository.
- **SRP (Single Responsibility Principle):** o "S" de SOLID — cada módulo (aqui, cada hook de caso de uso) deve ter um único motivo para mudar.
- **Composition Root:** o único ponto do app onde as implementações concretas são escolhidas e "ligadas" às abstrações — aqui, o `<RepositoryProvider>` em `app/_layout.tsx`.
- **DTO (Data Transfer Object):** formato "cru" que vem da fonte de dados, antes de virar um tipo de domínio.
- **DIP (Dependency Inversion Principle):** o "D" de SOLID — dependa de abstrações, não de implementações concretas.
- **Dependency Injection (DI):** técnica para fornecer uma implementação concreta a quem depende de uma abstração, sem que o consumidor precise instanciá-la. Aqui, feita via React Context.
- **CQS (Command-Query Separation):** princípio de nível método/função (Bertrand Meyer) — todo método é uma Query (lê, sem efeito colateral) ou um Command (causa efeito colateral), nunca os dois.
- **CQRS (Command Query Responsibility Segregation):** a versão arquitetural do CQS (Greg Young) — leitura e escrita podem ter modelos, caminhos de código e até armazenamentos separados.
- **Command Pattern:** encapsular uma operação (geralmente de escrita) como um objeto/função com `execute()`.
- **Structural typing / Duck typing:** em TypeScript, um valor satisfaz uma interface se tiver o formato certo (mesmos métodos/assinaturas) — não importa se é uma `class` ou um objeto literal.
