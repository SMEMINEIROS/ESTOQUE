import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc,
  getDocs, getDoc, query, orderBy, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
const db = getFirestore(app);

let produtosCache = [];
let movimentacoesCache = [];

/* ===== FEEDBACK ===== */
const feedbackEl = document.getElementById("feedback-global");
function mostrarFeedback(msg, tipo = "info") {
  feedbackEl.textContent = msg;
  feedbackEl.className = `feedback ${tipo}`;
  clearTimeout(feedbackEl._timeout);
  feedbackEl._timeout = setTimeout(() => feedbackEl.classList.add("oculto"), 4000);
}

/* ===== NAVEGAÇÃO ===== */
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => trocarTela(btn.dataset.tela));
});
function trocarTela(nome) {
  document.querySelectorAll(".tela-interna").forEach(s => s.classList.remove("ativa"));
  document.getElementById(`tela-${nome}`).classList.add("ativa");
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("ativo", b.dataset.tela === nome));
}

/* ===== LOGIN / LOGOUT ===== */
const formLogin = document.getElementById("form-login");
const loginErro = document.getElementById("login-erro");

formLogin.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginErro.textContent = "";
  const email = document.getElementById("login-email").value.trim();
  const senha = document.getElementById("login-senha").value;
  if (!email || !senha) {
    loginErro.textContent = "Preencha email e senha.";
    return;
  }
  try {
    await signInWithEmailAndPassword(auth, email, senha);
  } catch (err) {
    loginErro.textContent = mapErroAuth(err.code);
  }
});

function mapErroAuth(code) {
  switch (code) {
    case "auth/user-not-found": return "Usuário não encontrado.";
    case "auth/wrong-password": return "Senha incorreta.";
    case "auth/invalid-email": return "Email inválido.";
    case "auth/invalid-credential": return "Email ou senha incorretos.";
    case "auth/too-many-requests": return "Muitas tentativas. Tente novamente mais tarde.";
    default: return "Erro ao entrar. Tente novamente.";
  }
}

document.getElementById("btn-logout").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  const telaLogin = document.getElementById("tela-login");
  const app = document.getElementById("app");
  if (user) {
    telaLogin.classList.remove("ativa");
    app.classList.remove("oculto");
    iniciarDados();
  } else {
    telaLogin.classList.add("ativa");
    app.classList.add("oculto");
  }
});

/* ===== DADOS: PRODUTOS ===== */
const produtosRef = collection(db, "produtos");
const movimentacoesRef = collection(db, "movimentacoes");

function iniciarDados() {
  onSnapshot(produtosRef, (snap) => {
    produtosCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderProdutos();
    preencherSelects();
    renderDashboard();
  }, (err) => mostrarFeedback("Erro ao carregar produtos: " + err.message, "erro"));

  onSnapshot(query(movimentacoesRef, orderBy("criadoEm", "desc")), (snap) => {
    movimentacoesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderMovimentacoes();
    renderDashboard();
  }, (err) => mostrarFeedback("Erro ao carregar movimentações: " + err.message, "erro"));

  document.getElementById("entrada-data").valueAsDate = new Date();
  document.getElementById("saida-data").valueAsDate = new Date();
}

/* ===== FORM PRODUTO ===== */
const formProduto = document.getElementById("form-produto");
const btnCancelarEdicao = document.getElementById("btn-cancelar-edicao");
const btnSalvarProduto = document.getElementById("btn-salvar-produto");

formProduto.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("produto-id").value;
  const dados = {
    nome: document.getElementById("produto-nome").value.trim(),
    categoria: document.getElementById("produto-categoria").value.trim(),
    tamanho: document.getElementById("produto-tamanho").value.trim(),
    quantidade: Number(document.getElementById("produto-quantidade").value),
    estoqueMinimo: Number(document.getElementById("produto-minimo").value)
  };
  if (!dados.nome || !dados.categoria || !dados.tamanho || dados.quantidade < 0 || dados.estoqueMinimo < 0) {
    mostrarFeedback("Preencha todos os campos corretamente.", "erro");
    return;
  }
  try {
    if (id) {
      await updateDoc(doc(db, "produtos", id), dados);
      mostrarFeedback("Produto atualizado com sucesso.", "sucesso");
    } else {
      await addDoc(produtosRef, { ...dados, criadoEm: serverTimestamp() });
      mostrarFeedback("Produto cadastrado com sucesso.", "sucesso");
    }
    resetFormProduto();
  } catch (err) {
    mostrarFeedback("Erro ao salvar produto: " + err.message, "erro");
  }
});

btnCancelarEdicao.addEventListener("click", resetFormProduto);

function resetFormProduto() {
  formProduto.reset();
  document.getElementById("produto-id").value = "";
  btnSalvarProduto.textContent = "Cadastrar Produto";
  btnCancelarEdicao.classList.add("oculto");
}

function editarProduto(id) {
  const p = produtosCache.find(x => x.id === id);
  if (!p) return;
  document.getElementById("produto-id").value = p.id;
  document.getElementById("produto-nome").value = p.nome;
  document.getElementById("produto-categoria").value = p.categoria;
  document.getElementById("produto-tamanho").value = p.tamanho;
  document.getElementById("produto-quantidade").value = p.quantidade;
  document.getElementById("produto-minimo").value = p.estoqueMinimo;
  btnSalvarProduto.textContent = "Salvar alterações";
  btnCancelarEdicao.classList.remove("oculto");
  trocarTela("produtos");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function excluirProduto(id) {
  if (!confirm("Excluir este produto? Essa ação não remove o histórico de movimentações.")) return;
  try {
    await deleteDoc(doc(db, "produtos", id));
    mostrarFeedback("Produto excluído.", "sucesso");
  } catch (err) {
    mostrarFeedback("Erro ao excluir produto: " + err.message, "erro");
  }
}

function renderProdutos() {
  const tbody = document.getElementById("tbody-produtos");
  tbody.innerHTML = "";
  produtosCache
    .sort((a, b) => a.nome.localeCompare(b.nome))
    .forEach(p => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${p.nome}</td>
        <td>${p.categoria}</td>
        <td>${p.tamanho}</td>
        <td>${p.quantidade}</td>
        <td>${p.estoqueMinimo}</td>
        <td class="acoes-tabela">
          <button data-acao="editar" data-id="${p.id}">Editar</button>
          <button data-acao="excluir" data-id="${p.id}">Excluir</button>
        </td>`;
      tbody.appendChild(tr);
    });
  tbody.querySelectorAll("button[data-acao='editar']").forEach(b => b.addEventListener("click", () => editarProduto(b.dataset.id)));
  tbody.querySelectorAll("button[data-acao='excluir']").forEach(b => b.addEventListener("click", () => excluirProduto(b.dataset.id)));
}

function preencherSelects() {
  const selects = [
    document.getElementById("entrada-produto"),
    document.getElementById("saida-produto"),
    document.getElementById("filtro-produto")
  ];
  const ordenados = [...produtosCache].sort((a, b) => a.nome.localeCompare(b.nome));
  selects.forEach(sel => {
    const valorAtual = sel.value;
    const isFiltro = sel.id === "filtro-produto";
    sel.innerHTML = isFiltro ? `<option value="">Todos os produtos</option>` : `<option value="">Selecione...</option>`;
    ordenados.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `${p.nome} - ${p.tamanho} (${p.quantidade} em estoque)`;
      sel.appendChild(opt);
    });
    if (valorAtual) sel.value = valorAtual;
  });
}

/* ===== FORM ENTRADA ===== */
document.getElementById("form-entrada").addEventListener("submit", async (e) => {
  e.preventDefault();
  const produtoId = document.getElementById("entrada-produto").value;
  const quantidade = Number(document.getElementById("entrada-quantidade").value);
  const data = document.getElementById("entrada-data").value;
  const obs = document.getElementById("entrada-obs").value.trim();

  const produto = produtosCache.find(p => p.id === produtoId);
  if (!produto) { mostrarFeedback("Selecione um produto válido.", "erro"); return; }
  if (quantidade <= 0) { mostrarFeedback("Quantidade deve ser maior que zero.", "erro"); return; }

  try {
    await updateDoc(doc(db, "produtos", produtoId), { quantidade: produto.quantidade + quantidade });
    await addDoc(movimentacoesRef, {
      produtoId, produtoNome: `${produto.nome} - ${produto.tamanho}`,
      tipo: "entrada", quantidade, data, retiradoPor: "", observacao: obs,
      criadoEm: serverTimestamp()
    });
    mostrarFeedback("Entrada registrada com sucesso.", "sucesso");
    e.target.reset();
    document.getElementById("entrada-data").valueAsDate = new Date();
  } catch (err) {
    mostrarFeedback("Erro ao registrar entrada: " + err.message, "erro");
  }
});

/* ===== FORM SAÍDA ===== */
document.getElementById("form-saida").addEventListener("submit", async (e) => {
  e.preventDefault();
  const produtoId = document.getElementById("saida-produto").value;
  const quantidade = Number(document.getElementById("saida-quantidade").value);
  const data = document.getElementById("saida-data").value;
  const retiradoPor = document.getElementById("saida-retirado-por").value.trim();
  const obs = document.getElementById("saida-obs").value.trim();

  const produto = produtosCache.find(p => p.id === produtoId);
  if (!produto) { mostrarFeedback("Selecione um produto válido.", "erro"); return; }
  if (quantidade <= 0) { mostrarFeedback("Quantidade deve ser maior que zero.", "erro"); return; }
  if (!retiradoPor) { mostrarFeedback('Informe o nome de quem está retirando.', "erro"); return; }
  if (quantidade > produto.quantidade) {
    mostrarFeedback(`Estoque insuficiente. Disponível: ${produto.quantidade}.`, "erro");
    return;
  }

  try {
    await updateDoc(doc(db, "produtos", produtoId), { quantidade: produto.quantidade - quantidade });
    await addDoc(movimentacoesRef, {
      produtoId, produtoNome: `${produto.nome} - ${produto.tamanho}`,
      tipo: "saida", quantidade, data, retiradoPor, observacao: obs,
      criadoEm: serverTimestamp()
    });
    mostrarFeedback("Saída registrada com sucesso.", "sucesso");
    e.target.reset();
    document.getElementById("saida-data").valueAsDate = new Date();
  } catch (err) {
    mostrarFeedback("Erro ao registrar saída: " + err.message, "erro");
  }
});

/* ===== HISTÓRICO / FILTROS ===== */
document.getElementById("filtro-produto").addEventListener("change", renderMovimentacoes);
document.getElementById("filtro-tipo").addEventListener("change", renderMovimentacoes);

function renderMovimentacoes() {
  const filtroProduto = document.getElementById("filtro-produto").value;
  const filtroTipo = document.getElementById("filtro-tipo").value;
  const tbody = document.getElementById("tbody-movimentacoes");
  tbody.innerHTML = "";

  movimentacoesCache
    .filter(m => (!filtroProduto || m.produtoId === filtroProduto) && (!filtroTipo || m.tipo === filtroTipo))
    .forEach(m => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formatarData(m.data)}</td>
        <td class="${m.tipo === 'entrada' ? 'badge-entrada' : 'badge-saida'}">${m.tipo === 'entrada' ? 'Entrada' : 'Saída'}</td>
        <td>${m.produtoNome}</td>
        <td>${m.quantidade}</td>
        <td>${m.retiradoPor || '-'}</td>
        <td>${m.observacao || '-'}</td>`;
      tbody.appendChild(tr);
    });
}

function formatarData(dataStr) {
  if (!dataStr) return "-";
  const [ano, mes, dia] = dataStr.split("-");
  return `${dia}/${mes}/${ano}`;
}

/* ===== DASHBOARD ===== */
function renderDashboard() {
  const totalItens = produtosCache.reduce((acc, p) => acc + Number(p.quantidade || 0), 0);
  const totalProdutos = produtosCache.length;
  const estoqueBaixo = produtosCache.filter(p => Number(p.quantidade) <= Number(p.estoqueMinimo));

  document.getElementById("kpi-total-itens").textContent = totalItens;
  document.getElementById("kpi-total-produtos").textContent = totalProdutos;
  document.getElementById("kpi-estoque-baixo").textContent = estoqueBaixo.length;

  const listaBaixo = document.getElementById("lista-estoque-baixo");
  listaBaixo.innerHTML = estoqueBaixo.length
    ? estoqueBaixo.map(p => `<li><strong>${p.nome} - ${p.tamanho}</strong>: ${p.quantidade} em estoque (mínimo ${p.estoqueMinimo})</li>`).join("")
    : "<li>Nenhum produto com estoque baixo.</li>";

  const ultimas = movimentacoesCache.slice(0, 8);
  const listaUltimas = document.getElementById("lista-ultimas-mov");
  listaUltimas.innerHTML = ultimas.length
    ? ultimas.map(m => `<li>[${formatarData(m.data)}] ${m.tipo === 'entrada' ? 'Entrada' : 'Saída'} de ${m.quantidade}x ${m.produtoNome}${m.retiradoPor ? ' - retirado por ' + m.retiradoPor : ''}</li>`).join("")
    : "<li>Nenhuma movimentação registrada.</li>";
}
