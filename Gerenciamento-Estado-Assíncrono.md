# Gerenciamento de Estado Assíncrono com TanStack Query — Guia do Especialista

> **Para quem é:** o dev que quer decidir *quando* um dado remoto vira "server state", *como* o TanStack Query o gerencia (cache, revalidação, mutações, UI otimista) e *o que ele não resolve*.
> **Contexto:** módulo 9 do curso (aulas 3 a 23). App Expo + Supabase; `@tanstack/react-query` instalado (`^5.83.0` no `package.json`, **5.104.3** em `node_modules`).
> **Como este documento cresce:** uma aula por vez. Cada seção nasce como esqueleto e é preenchida com: conceito → exemplo → trade-off → "quando usar / o que evitar" → **Fixe**. *Medido* = executado neste projeto; *leitura do código* = visto no fonte; *raciocínio* = inferência, sempre sinalizada.
> Complementa [arquitetura-frontend.md](arquitetura-frontend.md) (camadas: operations/use cases), [auth-forms.md](auth-forms.md) (mutations de auth) e [tests.md](tests.md) (como testar — aula 7 estende a Parte 5).

## Índice

0. [A ideia central: server state × client state](#0-a-ideia-central-server-state--client-state)
1. [O ponto de partida: o que o `useAppQuery` artesanal faz — e não faz](#1-o-ponto-de-partida)
2. [Estado do código hoje](#2-estado-do-código-hoje)
3. [Queries — `useQuery`](#3-queries--usequery) *(aula 3)*
4. [Mutations — `useMutation`](#4-mutations--usemutation) *(aula 4)*
5. [Refatoração: `useAppQuery` e `useAppMutation` sobre o TanStack](#5-refatoração-useappquery-e-useappmutation-sobre-o-tanstack) *(aulas 5–6)*
6. [Testando com TanStack Query](#6-testando-com-tanstack-query) *(aula 7)*
7. [Aplicando: perfil e auth](#7-aplicando-perfil-e-auth) *(aulas 8–14)*
8. [Aplicando: favoritos e UI otimista](#8-aplicando-favoritos-e-ui-otimista) *(aulas 15–21)*
9. [Estados de tela e Explorar](#9-estados-de-tela-e-explorar) *(aulas 22–23)*
10. [Casos reais](#10-casos-reais) · [Playbook e checklist](#11-playbook-e-checklist) · [Glossário](#glossário) · [Mapa aula → seção](#mapa-aula--seção)

---

## 0. A ideia central: server state × client state

*(a consolidar na aula 3 com a fala do curso — rascunho de trabalho abaixo)*

| | Client state | Server state |
|---|---|---|
| Onde mora a verdade | No app (tema, aba, rascunho de form) | **Fora do app** (banco/API) — o app guarda uma **cópia** |
| Pode ficar desatualizado? | Não | **Sim** — qualquer outro cliente pode alterá-lo |
| Precisa de | `useState`/Context | cache, deduplicação, revalidação, retry, invalidação |
| Ferramenta natural | React | uma biblioteca de **server state** (TanStack Query) |

**Pergunta de decisão (raciocínio):** "se eu fechar e reabrir o app, esse dado vem de onde?" Se vem de um servidor → é server state.

---

## 1. O ponto de partida

O app já tinha um `useAppQuery`/`useAppMutation` **artesanais** (`src/infra/operations/`), por trás dos casos de uso (`useCityFindAll`, `useCityFindById`…). Isso é o "antes" que o TanStack vem substituir — e o contrato que a refatoração (aulas 5–6) precisa **manter** para as telas não mudarem.

**Contrato atual (leitura do código):**

```ts
useAppQuery(fetchData, dependencies?) → { data?, isLoading, error }
useAppMutation({ mutateFn, onSuccess?, onError? }) → { mutate, isLoading, error }
```

**O que o artesanal faz:** busca ao montar e quando `dependencies` muda; guarda `data`/`isLoading`/`error` em `useState`.

**O que ele não faz — e como sabemos:**

| Lacuna | Evidência | Origem |
|---|---|---|
| **Não tem cache**: cada montagem refaz a busca; duas telas pedindo o mesmo dado = duas chamadas | O estado vive em `useState` **dentro de cada hook**; nada é compartilhado | leitura do código |
| **Dependências por identidade** causam loop de render/efeito se a lista é recriada a cada render | 258.933 chamadas ao fetch em 300ms vs 1 com referência estável; travava o teste de integração | **medido** (tests.md, 6.2) |
| **Erro velho persiste** após novo fetch que dá certo; **dado velho** continua após fetch que falha | `error` nunca é zerado ao iniciar; `data` nunca é descartado na falha | **medido** (tests.md, Parte 7 #9) |
| **Sem deduplicação, sem retry, sem revalidação** (foco/reconexão) | Não existe no código | leitura do código |
| **Sem invalidação após mutation**: salvar não atualiza a lista que depende dele | `useAppMutation` não conhece queries | leitura do código |
| **Condição de corrida**: resposta antiga pode chegar depois da nova e sobrescrevê-la | Não há cancelamento nem checagem de "qual fetch é o atual" *(raciocínio — não reproduzido)* | raciocínio |

> **Princípio:** cada linha dessa tabela é um problema que o TanStack Query resolve **por design**. O valor de estudar o módulo é entender *qual mecanismo* resolve *qual lacuna* — não decorar a API.

---

## 2. Estado do código hoje

*(foto no início do módulo — atualizar a cada aula)*

- `app/_layout.tsx` agora envolve tudo em **`QueryClientProvider`**, com `const client = new QueryClient()` criado **fora do componente** (instância única por módulo; dentro do componente seria recriada — e o cache perdido — a cada render).
- O `RepositoryProvider` do layout raiz passou a usar **`SupabaseRepositories`** (antes: `InMemoryRepository`).
- `useAppQuery`/`useAppMutation` ainda são os **artesanais**; a refatoração vem nas aulas 5–6.

---

## 3. Queries — `useQuery`

*(aula 3 — a preencher)*

Esqueleto a cobrir: `queryKey` (o que identifica o dado) · `queryFn` · estados (`isPending`/`isLoading`/`isFetching`/`error`) · `staleTime` × `gcTime` · refetch automático · `enabled` · `select`.

---

## 4. Mutations — `useMutation`

*(aula 4 — a preencher)*

Esqueleto: `mutationFn` · `mutate` × `mutateAsync` · `onSuccess`/`onError`/`onSettled` · invalidação · diferença conceitual query × mutation (CQS, ver arquitetura-frontend.md).

---

## 5. Refatoração: `useAppQuery` e `useAppMutation` sobre o TanStack

*(aulas 5–6 — a preencher)*

Esqueleto: manter o **contrato** das telas (adapter) · mapear `dependencies` → `queryKey` · o que some (`useState`/`useEffect`) · o que muda de nome/semântica.

---

## 6. Testando com TanStack Query

*(aula 7 — a preencher)*

Esqueleto: `QueryClientProvider` no `renderApp` · **um `QueryClient` novo por teste** (cache vaza entre testes, como o singleton de storage) · `retry` desligado em teste · interação com fake timers do `renderRouter` · ligar com [tests.md](tests.md), Parte 5.

---

## 7. Aplicando: perfil e auth

*(aulas 8–14 — a preencher)*

`useAuthGetUser` · `ProfileHeader` · formatação de data com `date-fns` · telas de atualizar perfil/senha · `useAuthUpdateProfile` · `useAuthUpdatePassword` · **limpar o cache no Sign Out** (dado de um usuário não pode aparecer para o próximo).

---

## 8. Aplicando: favoritos e UI otimista

*(aulas 15–21 — a preencher)*

Favoritos no Supabase · `useFindAllFavorites` · `FavoriteCityCard` · listagem · `CityPreview` com favoritos · **`CityFavoriteButton` com UI otimista** (atualizar antes da resposta; reverter se falhar).

---

## 9. Estados de tela e Explorar

*(aulas 22–23 — a preencher)*

`CityDetails` com loading/erro · funcionalidade completa de Explorar.

---

## 10. Casos reais

*(erros e descobertas ao longo do módulo — uma linha por caso: sintoma → causa → correção → princípio)*

| # | Sintoma | Causa | Correção | Princípio |
|---|---|---|---|---|
| — | *(nenhum ainda)* | | | |

## 11. Playbook e checklist

*(consolidar no fim do módulo: sintoma → causa provável → primeira ação; checklist de revisão de uma query/mutation; perguntas com gabarito; exercícios)*

## Glossário

*(a preencher: server state, cache, `queryKey`, stale, `gcTime`, invalidação, refetch, UI otimista, deduplicação…)*

## Mapa aula → seção

| Aula | Tema | Seção |
|---|---|---|
| 3 | `useQuery` | 3 |
| 4 | `useMutation` | 4 |
| 5 | Refatoração da `useAppQuery` | 5 |
| 6 | Refatoração da `useAppMutation` | 5 |
| 7 | Testes com TanStack Query | 6 |
| 8 | `useAuthGetUser` — buscando dados do usuário | 7 |
| 9 | Componente `ProfileHeader` | 7 |
| 10 | Formatação de data com `date-fns` | 7 |
| 11 | Telas de atualizar perfil e senha | 7 |
| 12 | `useAuthUpdateProfile` — atualizando perfil | 7 |
| 13 | `useAuthUpdatePassword` — atualizando senha | 7 |
| 14 | Limpando cache no Sign Out | 7 |
| 15 | *(título não visível na captura, 11:43)* | 8 |
| 16 | Favoritos — Supabase e dados | 8 |
| 17 | Favoritos — `useFindAllFavorites` | 8 |
| 18 | Favoritos — `FavoriteCityCard` | 8 |
| 19 | Favoritos — listagem | 8 |
| 20 | `CityPreview` com favoritos | 8 |
| 21 | `CityFavoriteButton` — UI otimista | 8 |
| 22 | `CityDetails` — estados de loading e error | 9 |
| 23 | Explorar — funcionalidade completa | 9 |
