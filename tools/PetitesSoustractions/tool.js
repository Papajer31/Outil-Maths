let n1 = 5;
let n2 = 0;
let r = 5;

export default {

  mount(container){
    container.innerHTML = `
      <div class="tool-center">
        <div class="tool-big" id="ps_expr"></div>
      </div>
    `;
  },

  nextQuestion(container){
    // Contraintes :
    // 5 ≤ n1 ≤ 10
    // 0 ≤ n2 ≤ n1
    // r = n1 - n2 donc 0 ≤ r ≤ n1 (automatique)
    n1 = rand(5, 10);
    n2 = rand(0, n1);
    r = n1 - n2;

    container.querySelector("#ps_expr").textContent = `${n1} − ${n2}`;
  },

  showAnswer(container){
    container.querySelector("#ps_expr").textContent = `${n1} − ${n2} = ${r}`;
  },

  unmount(container){
    container.innerHTML = "";
  }

};

function rand(min, max){
  return Math.floor(Math.random() * (max - min + 1)) + min;
}