let n1 = 0;
let n2 = 0;
let r = 0;

export default {

  mount(container){
    container.innerHTML = `
      <div class="tool-center">
        <div class="tool-big" id="pa_expr"></div>
      </div>
    `;
  },

  nextQuestion(container){

    // génération respectant les contraintes
    do{
      n1 = rand(0,10);
      n2 = rand(0,10);
      r = n1 + n2;
    } while(r < 5 || r > 20);

    const el = container.querySelector("#pa_expr");
    el.textContent = `${n1} + ${n2}`;
  },

  showAnswer(container){
    const el = container.querySelector("#pa_expr");
    el.textContent = `${n1} + ${n2} = ${r}`;
  },

  unmount(container){
    container.innerHTML = "";
  }

};


function rand(min,max){
  return Math.floor(Math.random()*(max-min+1))+min;
}