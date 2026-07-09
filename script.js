/* ===== CONFIGURAÇÃO E INICIALIZAÇÃO FIREBASE ===== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getDatabase,
  ref,
  push,
  set,
  update,
  remove,
  onValue,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAQjgm3FRSAX93XdgTSWtkk7qW2DGkhybQ",
  authDomain: "estoque-uniformes.firebaseapp.com",
  databaseURL: "https://estoque-uniformes-default-rtdb.firebaseio.com",
  projectId: "estoque-uniformes",
  storageBucket: "estoque-uniformes.firebasestorage.app",
  messagingSenderId: "1023222277443",
  appId: "1:1023222277443:web:c96d4b40481253c8623bf6"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const produtosRef = ref(db, "produtos");
const movimentacoesRef = ref(db, "movimentacoes");

/* ===== CACHES LOCAIS ===== */
let produtosCache = [];
let movimentacoesCache = [];

/* ===== ELEMENTOS GLOBAIS ===== */
const telaLogin = document.getElementById("tela-login");
const appEl = document.getElementById("app");
const formLogin = document.getElementById("form-login");
const loginErro = document.getElementById("login-erro");
const btnLogout = document.getElementById("btn-logout");
const feedbackGlobal = document.getElementById("feedback-global");

/* ===== FEEDBACK ===== */
function mostrarFeedback(mensagem, tipo = "sucesso") {
  feedbackGlobal.textContent = mensagem;
  feedbackGlobal.classList.remove("oculto", "erro");
  if (tipo === "erro") feedbackGlobal.classList.add("erro");
  setTimeout(() => feedbackGlobal.classList.add("oculto"), 4000);
}

/* ===== AUTENTICAÇÃO ===== */
formLogin.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginErro.textContent = "";

  const email = document.getElementById("login-email").value.trim();
  const senha = document.getElementById("login-senha").value;

  try {
    await signInWithEmailAndPassword(auth, email, senha);
  } catch (err) {
    loginErro.textContent = traduzirErroLogin(err.code);
  }
});

btnLogout.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (err) {
    mostrarFeedback("Erro ao sair: " + err.message, "erro");
  }
});

onAuthStateChanged(auth, (user) => {
  if (user) {
    telaLogin.classList.remove("ativa");
    appEl.classList.remove("oculto");
  } else {
    appEl.classList.add("oculto");
    telaLogin.classList.add("ativa");
  }
});

function traduzirErroLogin(code) {
  const mapa = {
    "auth/invalid-email": "Email inválido.",
    "auth/user-not-found": "Usuário não encontrado.",
    "auth/wrong-password": "Senha incorreta.",
    "auth/invalid-credential": "Credenciais inválidas.",
    "auth/too-many-requests": "Muitas tentativas. Tente novamente mais tarde."
  };
  return mapa[code] || "Erro ao fazer login. Verifique os dados.";
}

/* ===== NAVEGAÇÃO ENTRE TELAS ===== */
const navBtns = document.querySelectorAll(".nav-btn");
const telas = document.querySelectorAll("#app .tela-interna");

navBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const destino = btn.dataset.tela;
    navBtns.forEach((b) => b.classList.remove("ativo"));
    btn.classList.add("ativo");
    telas.forEach((tela) => {
      tela.classList.toggle("ativa", tela.id === `tela-${destino}`);
    });
  });
});

/* ===== PRODUTOS: FORMULÁRIO (CRIAR / EDITAR) ===== */
const formProduto = document.getElementById("form-produto");
const produtoId = document.getElementById("produto-id");
const produtoNome = document.getElementById("produto-nome");
const produtoCategoria = document.getElementById("produto-categoria");
const produtoTamanho = document.getElementById("produto-tamanho");
const produtoQuantidade = document.getElementById("produto-quantidade");
const produtoMinimo = document.getElementById("produto-minimo");
const btnSalvarProduto = document.getElementById("btn-salvar-produto");
const btnCancelarEdicao = document.getElementById("btn-cancelar-edicao");
const tbodyProdutos = document.getElementById("tbody-produtos");

formProduto.addEventListener("submit", async (e) => {
  e.preventDefault();

  const nome = produtoNome.value.trim();
  const categoria = produtoCategoria.value.trim();
  const tamanho = produtoTamanho.value.trim();
  const quantidade = Number(produtoQuantidade.value);
  const estoqueMinimo = Number(produtoMinimo.value);

  if (!nome || !categoria || !tamanho || quantidade < 0 || estoqueMinimo < 0) {
    mostrarFeedback("Preencha todos os campos corretamente.", "erro");
    return;
  }

  try {
    if (produtoId.value) {
      await update(ref(db, `produtos/${produtoId.value}`), {
        nome, categoria, tamanho, quantidade, estoqueMinimo
      });
      mostrarFeedback("Produto atualizado com sucesso.");
    } else {
      const duplicado = produtosCache.some(p =>
        p.nome.toLowerCase() === nome.toLowerCase() &&
        p.categoria.toLowerCase() === categoria.toLowerCase() &&
        p.tamanho.toLowerCase() === tamanho.toLowerCase()
      );
      if (duplicado) {
        mostrarFeedback("Já existe um produto com esse nome, categoria e tamanho.", "erro");
        return;
      }
      const novoRef = push(produtosRef);
      await set(novoRef, {
        nome, categoria, tamanho, quantidade, estoqueMinimo,
        criadoEm: serverTimestamp()
      });
      mostrarFeedback("Produto cadastrado com sucesso.");
    }
    resetarFormProduto();
  } catch (err) {
    mostrarFeedback("Erro ao salvar produto: " + err.message, "erro");
  }
});

btnCancelarEdicao.addEventListener("click", resetarFormProduto);

function resetarFormProduto() {
  formProduto.reset();
  produtoId.value = "";
  btnSalvarProduto.textContent = "Cadastrar Produto";
  btnCancelarEdicao.classList.add("oculto");
}

function editarProduto(p) {
  produtoId.value = p.id;
  produtoNome.value = p.nome;
  produtoCategoria.value = p.categoria;
  produtoTamanho.value = p.tamanho;
  produtoQuantidade.value = p.quantidade;
  produtoMinimo.value = p.estoqueMinimo;
  btnSalvarProduto.textContent = "Salvar Alterações";
  btnCancelarEdicao.classList.remove("oculto");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function excluirProduto(id) {
  if (!confirm("Tem certeza que deseja excluir este produto?")) return;
  try {
    await remove(ref(db, `produtos/${id}`));
    mostrarFeedback("Produto excluído.");
  } catch (err) {
    mostrarFeedback("Erro ao excluir: " + err.message, "erro");
  }
}

/* ===== PRODUTOS: LISTAGEM EM TEMPO REAL ===== */
onValue(produtosRef, (snapshot) => {
  const dados = snapshot.val() || {};
  produtosCache = Object.entries(dados)
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  renderizarTabelaProdutos();
  atualizarSelectsProdutos();
  atualizarDashboard();
});

function renderizarTabelaProdutos() {
  tbodyProdutos.innerHTML = "";
  produtosCache.forEach(p => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.nome}</td>
      <td>${p.categoria}</td>
      <td>${p.tamanho}</td>
      <td>${p.quantidade}</td>
      <td>${p.estoqueMinimo}</td>
      <td>
        <button class="acao-editar" data-id="${p.id}">Editar</button>
        <button class="acao-excluir" data-id="${p.id}">Excluir</button>
      </td>
    `;
    tbodyProdutos.appendChild(tr);
  });

  tbodyProdutos.querySelectorAll(".acao-editar").forEach(btn => {
    btn.addEventListener("click", () => {
      const p = produtosCache.find(x => x.id === btn.dataset.id);
      if (p) editarProduto(p);
    });
  });

  tbodyProdutos.querySelectorAll(".acao-excluir").forEach(btn => {
    btn.addEventListener("click", () => excluirProduto(btn.dataset.id));
  });
}

/* ===== MOVIMENTAÇÕES: SELECTS DE PRODUTOS ===== */
const selectEntradaProduto = document.getElementById("entrada-produto");
const selectSaidaProduto = document.getElementById("saida-produto");
const selectFiltroProduto = document.getElementById("filtro-produto");

function atualizarSelectsProdutos() {
  const opcoes = produtosCache.map(p =>
    `<option value="${p.id}">${p.nome} - ${p.categoria} - ${p.tamanho}</option>`
  ).join("");

  selectEntradaProduto.innerHTML = opcoes;
  selectSaidaProduto.innerHTML = opcoes;
  selectFiltroProduto.innerHTML =
    `<option value="">Todos os produtos</option>` + opcoes;
}

/* ===== MOVIMENTAÇÕES: REGISTRAR ENTRADA ===== */
const formEntrada = document.getElementById("form-entrada");

formEntrada.addEventListener("submit", async (e) => {
  e.preventDefault();

  const produtoIdSel = selectEntradaProduto.value;
  const quantidade = Number(document.getElementById("entrada-quantidade").value);
  const data = document.getElementById("entrada-data").value;
  const obs = document.getElementById("entrada-obs").value.trim();

  if (!produtoIdSel || quantidade <= 0 || !data) {
    mostrarFeedback("Preencha os dados da entrada corretamente.", "erro");
    return;
  }

  const produto = produtosCache.find(p => p.id === produtoIdSel);
  if (!produto) return;

  try {
    await update(ref(db, `produtos/${produtoIdSel}`), {
      quantidade: produto.quantidade + quantidade
    });

    const novaMov = push(movimentacoesRef);
    await set(novaMov, {
      tipo: "entrada",
      produtoId: produtoIdSel,
      produtoNome: produto.nome,
      quantidade,
      data,
      obs,
      criadoEm: serverTimestamp()
    });

    mostrarFeedback("Entrada registrada com sucesso.");
    formEntrada.reset();
  } catch (err) {
    mostrarFeedback("Erro ao registrar entrada: " + err.message, "erro");
  }
});

/* ===== MOVIMENTAÇÕES: REGISTRAR SAÍDA ===== */
const formSaida = document.getElementById("form-saida");

formSaida.addEventListener("submit", async (e) => {
  e.preventDefault();

  const produtoIdSel = selectSaidaProduto.value;
  const quantidade = Number(document.getElementById("saida-quantidade").value);
  const data = document.getElementById("saida-data").value;
  const retiradoPor = document.getElementById("saida-retirado-por").value.trim();
  const obs = document.getElementById("saida-obs").value.trim();

  if (!produtoIdSel || quantidade <= 0 || !data || !retiradoPor) {
    mostrarFeedback("Preencha os dados da saída corretamente.", "erro");
    return;
  }

  const produto = produtosCache.find(p => p.id === produtoIdSel);
  if (!produto) return;

  if (quantidade > produto.quantidade) {
    mostrarFeedback("Quantidade insuficiente em estoque.", "erro");
    return;
  }

  try {
    await update(ref(db, `produtos/${produtoIdSel}`), {
      quantidade: produto.quantidade - quantidade
    });

    const novaMov = push(movimentacoesRef);
    await set(novaMov, {
      tipo: "saida",
      produtoId: produtoIdSel,
      produtoNome: produto.nome,
      quantidade,
      data,
      retiradoPor,
      obs,
      criadoEm: serverTimestamp()
    });

    mostrarFeedback("Saída registrada com sucesso.");
    formSaida.reset();
  } catch (err) {
    mostrarFeedback("Erro ao registrar saída: " + err.message, "erro");
  }
});

/* ===== MOVIMENTAÇÕES: LISTAGEM E FILTROS ===== */
const tbodyMovimentacoes = document.getElementById("tbody-movimentacoes");
const filtroTipo = document.getElementById("filtro-tipo");

onValue(movimentacoesRef, (snapshot) => {
  const dados = snapshot.val() || {};
  movimentacoesCache = Object.entries(dados)
    .map(([id, m]) => ({ id, ...m }))
    .sort((a, b) => (b.criadoEm || 0) - (a.criadoEm || 0));
  renderizarTabelaMovimentacoes();
  atualizarDashboard();
});

function renderizarTabelaMovimentacoes() {
  const filtroProd = selectFiltroProduto.value;
  const filtroTp = filtroTipo.value;

  const filtradas = movimentacoesCache.filter(m => {
    return (!filtroProd || m.produtoId === filtroProd) &&
           (!filtroTp || m.tipo === filtroTp);
  });

  tbodyMovimentacoes.innerHTML = "";
  filtradas.forEach(m => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatarData(m.data)}</td>
      <td>${m.tipo === "entrada" ? "Entrada" : "Saída"}</td>
      <td>${m.produtoNome}</td>
      <td>${m.quantidade}</td>
      <td>${m.retiradoPor || "-"}</td>
      <td>${m.obs || "-"}</td>
    `;
    tbodyMovimentacoes.appendChild(tr);
  });
}

selectFiltroProduto.addEventListener("change", renderizarTabelaMovimentacoes);
filtroTipo.addEventListener("change", renderizarTabelaMovimentacoes);

function formatarData(dataISO) {
  if (!dataISO) return "-";
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano}`;
}

/* ===== DASHBOARD ===== */
const kpiTotalItens = document.getElementById("kpi-total-itens");
const kpiTotalProdutos = document.getElementById("kpi-total-produtos");
const kpiEstoqueBaixo = document.getElementById("kpi-estoque-baixo");
const listaEstoqueBaixo = document.getElementById("lista-estoque-baixo");
const listaUltimasMov = document.getElementById("lista-ultimas-mov");

function atualizarDashboard() {
  const totalItens = produtosCache.reduce((soma, p) => soma + p.quantidade, 0);
  const totalProdutos = produtosCache.length;
  const emBaixo = produtosCache.filter(p => p.quantidade <= p.estoqueMinimo);

  kpiTotalItens.textContent = totalItens;
  kpiTotalProdutos.textContent = totalProdutos;
  kpiEstoqueBaixo.textContent = emBaixo.length;

  listaEstoqueBaixo.innerHTML = emBaixo.length
    ? emBaixo.map(p => `<li>${p.nome} - ${p.categoria} - ${p.tamanho} (${p.quantidade}/${p.estoqueMinimo})</li>`).join("")
    : "<li>Nenhum produto com estoque baixo.</li>";

  const ultimas = movimentacoesCache.slice(0, 5);
  listaUltimasMov.innerHTML = ultimas.length
    ? ultimas.map(m => `<li>${formatarData(m.data)} - ${m.tipo === "entrada" ? "Entrada" : "Saída"} de ${m.quantidade} ${m.produtoNome}</li>`).join("")
    : "<li>Nenhuma movimentação registrada.</li>";
}

/* ===== MODAL: CADASTRO EM LOTE DE TAMANHOS ===== */
const modalTamanhos = document.getElementById("modal-tamanhos");
const btnAbrirTamanhos = document.getElementById("btn-abrir-tamanhos");
const btnFecharTamanhos = document.getElementById("btn-fechar-tamanhos");
const btnCancelarLote = document.getElementById("btn-cancelar-lote");
const btnAddLinhaTamanho = document.getElementById("btn-add-linha-tamanho");
const formTamanhosLote = document.getElementById("form-tamanhos-lote");
const containerLinhas = document.getElementById("lote-linhas-tamanhos");
const templateLinha = document.getElementById("template-linha-tamanho");

btnAbrirTamanhos.addEventListener("click", abrirModalTamanhos);
btnFecharTamanhos.addEventListener("click", fecharModalTamanhos);
btnCancelarLote.addEventListener("click", fecharModalTamanhos);
modalTamanhos.addEventListener("click", (e) => {
  if (e.target === modalTamanhos) fecharModalTamanhos();
});

function abrirModalTamanhos() {
  formTamanhosLote.reset();
  containerLinhas.innerHTML = "";
  adicionarLinhaTamanho();
  modalTamanhos.classList.remove("oculto");
}

function fecharModalTamanhos() {
  modalTamanhos.classList.add("oculto");
}

btnAddLinhaTamanho.addEventListener("click", () => adicionarLinhaTamanho());

function adicionarLinhaTamanho() {
  const fragmento = templateLinha.content.cloneNode(true);
  const linha = fragmento.querySelector(".linha-tamanho");
  linha.querySelector(".btn-remover-linha").addEventListener("click", () => {
    if (containerLinhas.children.length > 1) {
      linha.remove();
    } else {
      mostrarFeedback("Mantenha ao menos um tamanho no lote.", "erro");
    }
  });
  containerLinhas.appendChild(linha);
}

formTamanhosLote.addEventListener("submit", async (e) => {
  e.preventDefault();

  const nome = document.getElementById("lote-nome").value.trim();
  const categoria = document.getElementById("lote-categoria").value.trim();

  if (!nome || !categoria) {
    mostrarFeedback("Informe nome e categoria do produto.", "erro");
    return;
  }

  const linhas = Array.from(containerLinhas.querySelectorAll(".linha-tamanho"));
  const itens = linhas.map(linha => ({
    tamanho: linha.querySelector(".lote-tamanho-input").value.trim(),
    quantidade: Number(linha.querySelector(".lote-quantidade-input").value),
    estoqueMinimo: Number(linha.querySelector(".lote-minimo-input").value)
  }));

  const invalido = itens.some(i => !i.tamanho || i.quantidade < 0 || i.estoqueMinimo < 0);
  if (invalido) {
    mostrarFeedback("Preencha todos os tamanhos corretamente.", "erro");
    return;
  }

  const duplicados = itens.some(i =>
    produtosCache.some(p =>
      p.nome.toLowerCase() === nome.toLowerCase() &&
      p.categoria.toLowerCase() === categoria.toLowerCase() &&
      p.tamanho.toLowerCase() === i.tamanho.toLowerCase()
    )
  );
  if (duplicados) {
    mostrarFeedback("Já existe um produto cadastrado com esse nome, categoria e tamanho.", "erro");
    return;
  }

  try {
    await Promise.all(itens.map(i => {
      const novoRef = push(produtosRef);
      return set(novoRef, {
        nome,
        categoria,
        tamanho: i.tamanho,
        quantidade: i.quantidade,
        estoqueMinimo: i.estoqueMinimo,
        criadoEm: serverTimestamp()
      });
    }));
    mostrarFeedback(`${itens.length} tamanho(s) cadastrado(s) com sucesso.`, "sucesso");
    fecharModalTamanhos();
  } catch (err) {
    mostrarFeedback("Erro ao salvar tamanhos: " + err.message, "erro");
  }
});
