import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ============================================================================
// ESTADO GLOBAL E REFERÊNCIAS
// ============================================================================
const produtosCol = collection(db, "produtos");
const movimentacoesCol = collection(db, "movimentacoes");

let produtosCache = [];
let movimentacoesCache = [];
let movimentacoesFiltradas = [];

const estadoPaginacao = {
  produtos: { atual: 1, limite: 10 },
  movimentacoes: { atual: 1, limite: 10 }
};

const feedbackGlobal = document.getElementById("feedback-global");

function mostrarFeedback(mensagem, tipo = "sucesso") {
  feedbackGlobal.textContent = mensagem;
  feedbackGlobal.classList.remove("oculto", "erro");
  if (tipo === "erro") feedbackGlobal.classList.add("erro");
  setTimeout(() => feedbackGlobal.classList.add("oculto"), 4000);
}

function formatarData(dataISO) {
  if (!dataISO) return "-";
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano}`;
}

// ============================================================================
// AUTENTICAÇÃO E NAVEGAÇÃO
// ============================================================================
let listenersAtivos = false;

document.getElementById("form-login")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const senha = document.getElementById("login-senha").value;
  const erroEl = document.getElementById("login-erro");
  
  erroEl.textContent = "";
  
  try {
    await signInWithEmailAndPassword(auth, email, senha);
  } catch (err) {
    erroEl.textContent = "Erro ao fazer login. Verifique os dados.";
  }
});

document.getElementById("btn-logout")?.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  const appEl = document.getElementById("app");
  const telaLogin = document.getElementById("tela-login");
  
  if (user) {
    telaLogin.classList.add("oculto");
    appEl.classList.remove("oculto");
    if (!listenersAtivos) {
      iniciarListeners();
      listenersAtivos = true;
    }
  } else {
    appEl.classList.add("oculto");
    telaLogin.classList.remove("oculto");
  }
});

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

// ============================================================================
// LISTENERS DO FIRESTORE
// ============================================================================
function iniciarListeners() {
  onSnapshot(query(produtosCol, orderBy("nome")), (snapshot) => {
    produtosCache = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    renderizarTabelaProdutos();
    atualizarSelectsProdutos();
    atualizarDashboard();
  }, (err) => mostrarFeedback("Erro ao carregar produtos.", "erro"));

  onSnapshot(query(movimentacoesCol, orderBy("criadoEm", "desc")), (snapshot) => {
    movimentacoesCache = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    aplicarFiltrosMovimentacoes();
    atualizarDashboard();
  }, (err) => mostrarFeedback("Erro ao carregar movimentações.", "erro"));
}

// ============================================================================
// DASHBOARD
// ============================================================================
function atualizarDashboard() {
  const totalItens = produtosCache.reduce((soma, p) => soma + p.quantidade, 0);
  const emBaixo = produtosCache.filter(p => p.quantidade <= p.estoqueMinimo);

  document.getElementById("kpi-total-itens").textContent = totalItens;
  document.getElementById("kpi-total-produtos").textContent = produtosCache.length;
  document.getElementById("kpi-estoque-baixo").textContent = emBaixo.length;

  const listaEstoqueBaixo = document.getElementById("lista-estoque-baixo");
  if (listaEstoqueBaixo) {
    listaEstoqueBaixo.innerHTML = emBaixo.length
      ? emBaixo.map(p => `<li>${p.nome} - ${p.categoria} - ${p.tamanho} (${p.quantidade}/${p.estoqueMinimo})</li>`).join("")
      : "<li>Nenhum produto com estoque baixo.</li>";
  }

  const listaUltimasMov = document.getElementById("lista-ultimas-mov");
  if (listaUltimasMov) {
    const ultimas = movimentacoesCache.slice(0, 5);
    listaUltimasMov.innerHTML = ultimas.length
      ? ultimas.map(m => `<li>${formatarData(m.data)} - ${m.tipo === "entrada" ? "Entrada" : "Saída"} de ${m.quantidade} ${m.produtoNome} (${m.produtoTamanho || '-'})</li>`).join("")
      : "<li>Nenhuma movimentação registrada.</li>";
  }
}

// ============================================================================
// GERAÇÃO DE PDF
// ============================================================================
document.getElementById('btn-exportar-pdf')?.addEventListener('click', () => {
  if (!window.jspdf) {
    mostrarFeedback("Biblioteca PDF não carregada.", "erro");
    return;
  }
  
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  doc.setFontSize(16);
  doc.text("Secretaria Municipal de Educação", 14, 20);
  doc.setFontSize(12);
  doc.text("Relatório de Controle de Estoque de Uniformes", 14, 28);
  doc.setFontSize(10);
  doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 34);

  const corpoTabela = movimentacoesFiltradas.map(m => [
    formatarData(m.data),
    m.tipo === "entrada" ? "Entrada" : "Saída",
    `${m.produtoNome} (${m.produtoTamanho || '-'})`,
    m.quantidade,
    m.retiradoPor || "-"
  ]);

  doc.autoTable({
    startY: 40,
    head: [['Data', 'Tipo', 'Item', 'Qtd.', 'Responsável']],
    body: corpoTabela,
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42] }
  });

  doc.save("relatorio-estoque-sme.pdf");
});

// ============================================================================
// PRODUTOS (CRUD E PAGINAÇÃO)
// ============================================================================
const formProduto = document.getElementById("form-produto");
formProduto?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("produto-id").value;
  const nome = document.getElementById("produto-nome").value.trim();
  const categoria = document.getElementById("produto-categoria").value.trim();
  const tamanho = document.getElementById("produto-tamanho").value.trim();
  const quantidade = Number(document.getElementById("produto-quantidade").value);
  const estoqueMinimo = Number(document.getElementById("produto-minimo").value);

  try {
    if (id) {
      await updateDoc(doc(db, "produtos", id), { nome, categoria, tamanho, quantidade, estoqueMinimo });
      mostrarFeedback("Produto atualizado com sucesso.");
    } else {
      await addDoc(produtosCol, { nome, categoria, tamanho, quantidade, estoqueMinimo, criadoEm: serverTimestamp() });
      mostrarFeedback("Produto cadastrado com sucesso.");
    }
    formProduto.reset();
    document.getElementById("produto-id").value = "";
    document.getElementById("btn-salvar-produto").textContent = "Cadastrar Produto";
    document.getElementById("btn-cancelar-edicao").classList.add("oculto");
  } catch (err) {
    mostrarFeedback("Erro ao salvar produto.", "erro");
  }
});

document.getElementById("btn-cancelar-edicao")?.addEventListener("click", () => {
  formProduto.reset();
  document.getElementById("produto-id").value = "";
  document.getElementById("btn-salvar-produto").textContent = "Cadastrar Produto";
  document.getElementById("btn-cancelar-edicao").classList.add("oculto");
});

window.editarProduto = function(id) {
  const p = produtosCache.find(x => x.id === id);
  if (!p) return;
  document.getElementById("produto-id").value = p.id;
  document.getElementById("produto-nome").value = p.nome;
  document.getElementById("produto-categoria").value = p.categoria;
  document.getElementById("produto-tamanho").value = p.tamanho;
  document.getElementById("produto-quantidade").value = p.quantidade;
  document.getElementById("produto-minimo").value = p.estoqueMinimo;
  document.getElementById("btn-salvar-produto").textContent = "Salvar Alterações";
  document.getElementById("btn-cancelar-edicao").classList.remove("oculto");
  window.scrollTo({ top: 0, behavior: "smooth" });
};

window.excluirProduto = async function(id) {
  if (!confirm("Tem certeza que deseja excluir este produto?")) return;
  try {
    await deleteDoc(doc(db, "produtos", id));
    mostrarFeedback("Produto excluído.");
  } catch (err) {
    mostrarFeedback("Erro ao excluir.", "erro");
  }
};

function renderizarTabelaProdutos() {
  const tbody = document.getElementById("tbody-produtos");
  if (!tbody) return;

  const { atual, limite } = estadoPaginacao.produtos;
  const inicio = (atual - 1) * limite;
  const fim = inicio + limite;
  const itensPagina = produtosCache.slice(inicio, fim);

  tbody.innerHTML = itensPagina.map(p => `
    <tr>
      <td>${p.nome}</td>
      <td>${p.categoria}</td>
      <td>${p.tamanho}</td>
      <td>${p.quantidade}</td>
      <td>${p.estoqueMinimo}</td>
      <td>
        <button class="acao-editar" onclick="editarProduto('${p.id}')">Editar</button>
        <button class="acao-excluir" onclick="excluirProduto('${p.id}')">Excluir</button>
      </td>
    </tr>
  `).join("");

  atualizarControlesPaginacaoProdutos();
}

function atualizarControlesPaginacaoProdutos() {
  const btnPrev = document.getElementById("btn-prev-prod");
  const btnNext = document.getElementById("btn-next-prod");
  const info = document.getElementById("info-pagina-prod");
  const totalPaginas = Math.ceil(produtosCache.length / estadoPaginacao.produtos.limite) || 1;

  if (info) info.textContent = `Página ${estadoPaginacao.produtos.atual} de ${totalPaginas}`;
  if (btnPrev) btnPrev.disabled = estadoPaginacao.produtos.atual === 1;
  if (btnNext) btnNext.disabled = estadoPaginacao.produtos.atual === totalPaginas;
}

document.getElementById("btn-prev-prod")?.addEventListener("click", () => {
  if (estadoPaginacao.produtos.atual > 1) {
    estadoPaginacao.produtos.atual--;
    renderizarTabelaProdutos();
  }
});

document.getElementById("btn-next-prod")?.addEventListener("click", () => {
  const totalPaginas = Math.ceil(produtosCache.length / estadoPaginacao.produtos.limite);
  if (estadoPaginacao.produtos.atual < totalPaginas) {
    estadoPaginacao.produtos.atual++;
    renderizarTabelaProdutos();
  }
});

// ============================================================================
// MOVIMENTAÇÕES (ENTRADA, SAÍDA, FILTROS E PAGINAÇÃO)
// ============================================================================
function atualizarSelectsProdutos() {
  const opcoes = produtosCache.map(p => `<option value="${p.id}">${p.nome} - ${p.categoria} - ${p.tamanho}</option>`).join("");
  const selects = ["entrada-produto", "saida-produto", "filtro-produto"];
  selects.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = id === "filtro-produto" ? `<option value="">Todos os produtos</option>${opcoes}` : opcoes;
  });
}

document.getElementById("form-entrada")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const produtoId = document.getElementById("entrada-produto").value;
  const quantidade = Number(document.getElementById("entrada-quantidade").value);
  const data = document.getElementById("entrada-data").value;
  const obs = document.getElementById("entrada-obs").value.trim();

  const produto = produtosCache.find(p => p.id === produtoId);
  if (!produto) return;

  try {
    await updateDoc(doc(db, "produtos", produtoId), { quantidade: produto.quantidade + quantidade });
    await addDoc(movimentacoesCol, {
      tipo: "entrada", produtoId, produtoNome: produto.nome, produtoTamanho: produto.tamanho, quantidade, data, obs, criadoEm: serverTimestamp()
    });
    mostrarFeedback("Entrada registrada com sucesso.");
    e.target.reset();
  } catch (err) {
    mostrarFeedback("Erro ao registrar entrada.", "erro");
  }
});

document.getElementById("form-saida")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const produtoId = document.getElementById("saida-produto").value;
  const quantidade = Number(document.getElementById("saida-quantidade").value);
  const data = document.getElementById("saida-data").value;
  const retiradoPor = document.getElementById("saida-retirado-por").value.trim();
  const obs = document.getElementById("saida-obs").value.trim();

  const produto = produtosCache.find(p => p.id === produtoId);
  if (!produto || quantidade > produto.quantidade) {
    mostrarFeedback("Quantidade insuficiente em estoque.", "erro");
    return;
  }

  try {
    await updateDoc(doc(db, "produtos", produtoId), { quantidade: produto.quantidade - quantidade });
    await addDoc(movimentacoesCol, {
      tipo: "saida", produtoId, produtoNome: produto.nome, produtoTamanho: produto.tamanho, quantidade, data, retiradoPor, obs, criadoEm: serverTimestamp()
    });
    mostrarFeedback("Saída registrada com sucesso.");
    e.target.reset();
  } catch (err) {
    mostrarFeedback("Erro ao registrar saída.", "erro");
  }
});

function aplicarFiltrosMovimentacoes() {
  const termo = document.getElementById("busca-texto")?.value.toLowerCase() || "";
  const data = document.getElementById("busca-data")?.value || "";
  const tipo = document.getElementById("filtro-tipo")?.value || "";
  const produtoId = document.getElementById("filtro-produto")?.value || "";

  movimentacoesFiltradas = movimentacoesCache.filter(m => {
    const matchTermo = m.produtoNome.toLowerCase().includes(termo) || (m.retiradoPor || "").toLowerCase().includes(termo);
    const matchData = data ? m.data === data : true;
    const matchTipo = tipo ? m.tipo === tipo : true;
    const matchProduto = produtoId ? m.produtoId === produtoId : true;
    return matchTermo && matchData && matchTipo && matchProduto;
  });

  estadoPaginacao.movimentacoes.atual = 1;
  renderizarTabelaMovimentacoes();
}

["busca-texto", "busca-data", "filtro-tipo", "filtro-produto"].forEach(id => {
  document.getElementById(id)?.addEventListener("input", aplicarFiltrosMovimentacoes);
});

function renderizarTabelaMovimentacoes() {
  const tbody = document.getElementById("tbody-movimentacoes");
  if (!tbody) return;

  const { atual, limite } = estadoPaginacao.movimentacoes;
  const inicio = (atual - 1) * limite;
  const fim = inicio + limite;
  const itensPagina = movimentacoesFiltradas.slice(inicio, fim);

  tbody.innerHTML = itensPagina.map(m => `
    <tr>
      <td>${formatarData(m.data)}</td>
      <td>${m.tipo === "entrada" ? "Entrada" : "Saída"}</td>
      <td>${m.produtoNome} (Tamanho: ${m.produtoTamanho || '-'})</td>
      <td>${m.quantidade}</td>
      <td>${m.retiradoPor || "-"}</td>
      <td>${m.obs || "-"}</td>
    </tr>
  `).join("");

  atualizarControlesPaginacaoMov();
}

function atualizarControlesPaginacaoMov() {
  const btnPrev = document.getElementById("btn-prev-mov");
  const btnNext = document.getElementById("btn-next-mov");
  const info = document.getElementById("info-pagina-mov");
  const totalPaginas = Math.ceil(movimentacoesFiltradas.length / estadoPaginacao.movimentacoes.limite) || 1;

  if (info) info.textContent = `Página ${estadoPaginacao.movimentacoes.atual} de ${totalPaginas}`;
  if (btnPrev) btnPrev.disabled = estadoPaginacao.movimentacoes.atual === 1;
  if (btnNext) btnNext.disabled = estadoPaginacao.movimentacoes.atual === totalPaginas;
}

document.getElementById("btn-prev-mov")?.addEventListener("click", () => {
  if (estadoPaginacao.movimentacoes.atual > 1) {
    estadoPaginacao.movimentacoes.atual--;
    renderizarTabelaMovimentacoes();
  }
});

document.getElementById("btn-next-mov")?.addEventListener("click", () => {
  const totalPaginas = Math.ceil(movimentacoesFiltradas.length / estadoPaginacao.movimentacoes.limite);
  if (estadoPaginacao.movimentacoes.atual < totalPaginas) {
    estadoPaginacao.movimentacoes.atual++;
    renderizarTabelaMovimentacoes();
  }
});

// ============================================================================
// MODAL DE CADASTRO EM LOTE
// ============================================================================
const modalTamanhos = document.getElementById("modal-tamanhos");
const containerLinhas = document.getElementById("lote-linhas-tamanhos");
const templateLinha = document.getElementById("template-linha-tamanho");

document.getElementById("btn-abrir-tamanhos")?.addEventListener("click", () => {
  document.getElementById("form-tamanhos-lote").reset();
  containerLinhas.innerHTML = "";
  adicionarLinhaTamanho();
  modalTamanhos.classList.remove("oculto");
});

const fecharModalTamanhos = () => modalTamanhos.classList.add("oculto");
document.getElementById("btn-fechar-tamanhos")?.addEventListener("click", fecharModalTamanhos);
document.getElementById("btn-cancelar-lote")?.addEventListener("click", fecharModalTamanhos);

function adicionarLinhaTamanho() {
  const fragmento = templateLinha.content.cloneNode(true);
  const linha = fragmento.querySelector(".linha-tamanho");
  linha.querySelector(".btn-remover-linha").addEventListener("click", () => {
    if (containerLinhas.children.length > 1) linha.remove();
  });
  containerLinhas.appendChild(linha);
}

document.getElementById("btn-add-linha-tamanho")?.addEventListener("click", adicionarLinhaTamanho);

document.getElementById("form-tamanhos-lote")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const nome = document.getElementById("lote-nome").value.trim();
  const categoria = document.getElementById("lote-categoria").value.trim();

  const linhas = Array.from(containerLinhas.querySelectorAll(".linha-tamanho"));
  const itens = linhas.map(linha => ({
    tamanho: linha.querySelector(".lote-tamanho-input").value.trim(),
    quantidade: Number(linha.querySelector(".lote-quantidade-input").value),
    estoqueMinimo: Number(linha.querySelector(".lote-minimo-input").value)
  }));

  try {
    await Promise.all(itens.map(i =>
      addDoc(produtosCol, { nome, categoria, tamanho: i.tamanho, quantidade: i.quantidade, estoqueMinimo: i.estoqueMinimo, criadoEm: serverTimestamp() })
    ));
    mostrarFeedback("Lote cadastrado com sucesso.");
    fecharModalTamanhos();
  } catch (err) {
    mostrarFeedback("Erro ao salvar lote.", "erro");
  }
});
