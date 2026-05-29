# G-Control

Minisistema de intranet para gerenciar softwares, chaves de licenca, usuarios e vinculos.

## Requisitos

- Node.js 18 ou superior
- PostgreSQL
- Acesso de rede liberado para a porta escolhida, por exemplo `3000`

## Configuracao

1. Crie um banco no PostgreSQL chamado `controle_licencas`.
2. Copie `.env.example` para `.env`.
3. Ajuste `DATABASE_URL` com usuario, senha, servidor e banco.
4. Instale as dependencias:

```bash
npm install
```

5. Crie as tabelas:

```bash
npm run db:init
```

Esse comando tambem cria o login master:

```text
Usuario: admin
Senha: Projetos@2026*
Perfil: Admin
```

6. Inicie o sistema:

```bash
npm start
```

Depois acesse:

```text
http://localhost:3000
```

Para outras pessoas acessarem na rede, use o IP ou nome do computador/servidor:

```text
http://NOME-DO-SERVIDOR:3000
```

## Backup

Configure backup diario do banco PostgreSQL. Exemplo:

```bash
pg_dump -Fc controle_licencas > controle_licencas.backup
```

## Observacoes

- Os dados agora ficam no PostgreSQL, nao no navegador.
- Cada software pode ter varias chaves cadastradas. O vinculo do usuario e feito diretamente na chave escolhida.
- Usuarios de acesso ao sistema ficam na tabela `access_users`.
- Perfil `admin` pode cadastrar, editar e excluir. Perfil `viewer` tem somente visualizacao.
- O botao de importar JSON substitui os dados do banco pelo arquivo importado.
- O sistema ainda nao tem login; se precisar, a proxima etapa e adicionar autenticacao e perfis de acesso.
