(function () {
  const menuButton = document.querySelector('.menu-toggle');
  const navigation = document.querySelector('.site-nav');

  if (menuButton && navigation) {
    menuButton.addEventListener('click', () => {
      const isOpen = navigation.classList.toggle('open');
      menuButton.setAttribute('aria-expanded', String(isOpen));
    });
  }

  document.querySelectorAll('[data-url-form]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const input = form.querySelector('input[name="url"]');
      if (!input || !input.value.trim()) return;
      window.location.href = `/analyzer.html?url=${encodeURIComponent(input.value.trim())}`;
    });
  });

  const depthButtons = document.querySelectorAll('[data-depth]');
  depthButtons.forEach((button) => {
    button.addEventListener('click', () => {
      depthButtons.forEach((item) => item.classList.remove('selected'));
      button.classList.add('selected');
    });
  });

  const analysisForm = document.querySelector('#analysis-form');
  const progress = document.querySelector('#demo-progress');
  const result = document.querySelector('#demo-result');
  const progressBar = document.querySelector('#progress-bar');
  const progressPercent = document.querySelector('#progress-percent');
  const resetButton = document.querySelector('#reset-demo');
  const analysisInput = document.querySelector('#analysis-url');

  if (analysisInput) {
    const queryUrl = new URLSearchParams(window.location.search).get('url');
    if (queryUrl) analysisInput.value = queryUrl.replace(/^https?:\/\//, '');
  }

  if (analysisForm && progress && result) {
    analysisForm.addEventListener('submit', (event) => {
      event.preventDefault();
      progress.hidden = false;
      result.hidden = true;
      progress.scrollIntoView({ behavior: 'smooth', block: 'center' });

      const states = [
        { percent: 18, step: 1 },
        { percent: 58, step: 2 },
        { percent: 86, step: 3 },
        { percent: 100, step: 3 },
      ];
      let stateIndex = 0;

      if (progressBar) progressBar.style.width = '0%';
      if (progressPercent) progressPercent.textContent = '0%';
      progress.querySelectorAll('[data-step]').forEach((step) => step.classList.remove('done'));

      const timer = window.setInterval(() => {
        const state = states[stateIndex];
        if (progressBar) progressBar.style.width = `${state.percent}%`;
        if (progressPercent) progressPercent.textContent = `${state.percent}%`;
        progress.querySelectorAll('[data-step]').forEach((step) => {
          if (Number(step.dataset.step) <= state.step) step.classList.add('done');
        });
        stateIndex += 1;

        if (stateIndex === states.length) {
          window.clearInterval(timer);
          window.setTimeout(() => {
            progress.hidden = true;
            result.hidden = false;
            result.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 350);
        }
      }, 420);
    });
  }

  if (resetButton && analysisForm && result) {
    resetButton.addEventListener('click', () => {
      result.hidden = true;
      analysisForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (analysisInput) analysisInput.focus();
    });
  }

  document.querySelectorAll('.tree-leaves a, .tree-single').forEach((link) => {
    link.addEventListener('click', (event) => event.preventDefault());
  });
})();
