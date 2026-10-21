# Tortinni Empadas — Delivery

Loja de delivery da **Tortinni Empadas**. Front-end em React + TypeScript + Vite,
back-end em funções serverless com Neon PostgreSQL e Vercel Blob.

> **Estado atual:** o **front-end está pronto para aprovação visual** e roda sozinho,
> sem banco de dados. O back-end (banco, API, autenticação, pedidos e pagamento)
> já está implementado no repositório, mas só entra em operação quando o Neon e as
> variáveis de ambiente forem configurados. Veja [Ligando o back-end](#ligando-o-back-end).

---

## Rodando a vitrine (sem banco)

```bash
npm install
npm run dev:web      # http://localhost:5173
```

É só isso. O catálogo vem de `src/lib/catalog-data.ts`, com os **preços reais** e as
**fotos enviadas pela loja**. Nenhuma credencial é necessária.

Para gerar a versão de produção da vitrine:

```bash
npm run build && npm run preview
```

### O que já funciona na vitrine

| Tela | Rota | O que dá para fazer |
|---|---|---|
| Home | `/` | Hero, ofertas principais, combos, bebidas, horários |
| Cardápio | `/cardapio` | Buscar, filtrar por categoria, abrir detalhes |
| Combos | `/cardapio?categoria=combos` | Montar o combo escolhendo sabores e bebidas |
| Carrinho | gaveta lateral | Alterar quantidade, remover, ver pedido mínimo |
| Checkout | `/checkout` | Entrega ou retirada, dados, endereço, pagamento |
| Acompanhamento | `/pedido` | Prévia da linha do tempo do pedido |
| Contato / Entrega / LGPD | `/contato`, `/entrega`, `/politica-de-privacidade` | Páginas institucionais |
| 404 | qualquer outra | Página de erro personalizada |

O carrinho é **persistido no navegador**: atualizar a página ou navegar entre telas
não apaga os itens.

---

## Fotos dos produtos

As imagens em `public/images/produtos/` vêm das fotos enviadas pela loja. O script
`scripts/` de preparação recorta o fundo branco e gera WebP + JPEG em 400 e 800 px,
mais uma versão transparente para as seções escuras.

| Produto | Foto |
|---|---|
| Empadas (4 sabores) | foto real da empada — **a mesma para os 4 sabores**, até a loja enviar uma foto por sabor |
| Combos | foto real do combo |
| Coca-Cola 310 ml | foto real da lata |
| Coca-Cola Zero 310 ml | **sem foto** — o card mostra “Foto em breve” |
| Guaraná Antarctica 350 ml | **sem foto** — o card mostra “Foto em breve” |

Nenhum produto usa a foto de outro item. Quando falta foto, o card diz isso com
honestidade em vez de improvisar.

---

## Ligando o back-end

O back-end já está escrito. Para ativá-lo:

1. **Crie o banco** no [Neon](https://neon.tech) e copie a connection string
   (use o endpoint `-pooler`).
2. **Copie as variáveis**: `cp .env.example .env` e preencha `DATABASE_URL` e
   `SESSION_SECRET` (mínimo 32 caracteres).
3. **Aplique as migrations e o seed**:
   ```bash
   npm run db:migrate
   npm run db:seed
   ```
4. **Crie o primeiro administrador** (a senha é digitada no terminal, nunca fica no código):
   ```bash
   npm run admin:create
   ```
5. **Aponte a vitrine para a API**: `VITE_API_MODE=live` no `.env`.
6. **Suba tudo junto**: `npm run dev` (API em `:3001` + front em `:5173`).

Os tipos do catálogo local são **os mesmos** devolvidos por `GET /api/products`, então
a troca não exige mudar nenhuma tela.

### Integrações opcionais

| Integração | Variáveis | Sem configurar |
|---|---|---|
| Imagens (Vercel Blob) | `BLOB_READ_WRITE_TOKEN` | Upload no painel fica indisponível, com aviso |
| E-mail | `EMAIL_PROVIDER`, `RESEND_API_KEY` | Recuperação de senha avisa que o envio não está ativo |
| Pix online | `PAYMENT_*` | Pix aparece como “combinar com a loja”, nunca como pago |

Nada é simulado: um pedido só é marcado como pago depois de um webhook assinado e
com o valor conferido contra o total.

---

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | API + front-end juntos |
| `npm run dev:web` | Só a vitrine (não precisa de banco) |
| `npm run build` | Typecheck + build de produção |
| `npm run typecheck` | Verificação de tipos |
| `npm test` | Testes unitários e de integração |
| `npm run db:migrate` | Aplica as migrations |
| `npm run db:seed` | Popula categorias, produtos e combos |
| `npm run admin:create` | Cria o primeiro administrador |

---

## Testes

```bash
npm test
```

Os testes de integração rodam contra um PostgreSQL real e efêmero (PGlite), com as
migrations versionadas aplicadas — não são mocks.

---

## Publicando na Vercel

1. Importe o repositório na Vercel (framework detectado: Vite).
2. Cadastre as variáveis de ambiente de produção (`.env.example` lista todas).
3. Em **Storage → Blob**, conecte um store e copie `BLOB_READ_WRITE_TOKEN`.
4. Rode `npm run db:migrate` apontando para o banco de produção.
5. Defina `PUBLIC_SITE_URL` com o domínio final.

`vercel.json` já traz o build, o roteamento SPA, a função serverless da API e os
cabeçalhos de cache.

---

## Estrutura

```
src/
  components/   botões, modal, gaveta, imagem de produto, marca
  features/     catalog (cards, modal, combos), cart (estado + gaveta)
  pages/        Home, Cardápio, Checkout, Pedido, institucionais, 404
  hooks/        carregamento assíncrono, debounce, trava de scroll
  lib/          cliente da API e catálogo de apresentação
shared/         regras usadas pelo front e pelo back (preços, status, moeda)
server/         roteador, serviços, validações e segurança da API
db/             schema Drizzle, migrations versionadas e seed
api/            entrada serverless da Vercel
tests/          unitários e de integração
```
