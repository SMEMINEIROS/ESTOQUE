import { auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const estadoPaginacao = {
  movimentacoes: { atual: 1, limite: 10 },
  produtos: { atual: 1, limite: 10 }
};

document.getElementById('btn-exportar-pdf')?.addEventListener('click', () => {
  gerarRelatorioPDF();
});

function gerarRelatorioPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  doc.text("Relatório de Movimentações", 14, 20);
  doc.save("relatorio-estoque.pdf");
}

onAuthStateChanged(auth, (user) => {
  const appEl = document.getElementById("app");
  const telaLogin = document.getElementById("tela-login");
  
  if (user) {
    telaLogin.classList.remove("ativa");
    appEl.classList.remove("oculto");
  } else {
    appEl.classList.add("oculto");
    telaLogin.classList.add("ativa");
  }
});
