import { streamSearchPrices } from './grpc-client.js';

const form = document.querySelector('#search-form');
const input = document.querySelector('#query');
const statusEl = document.querySelector('#status');
const resultsSection = document.querySelector('#results');
const list = document.querySelector('#suggestions');
const submitButton = form.querySelector('button');

let activeAbortController = null;

const setStatus = (message, variant = 'info') => {
  statusEl.textContent = message ?? '';
  statusEl.dataset.variant = variant;
};

const clearResults = () => {
  list.innerHTML = '';
  resultsSection.classList.add('hidden');
};

const buildRequestPayload = () => {
  return {
    product: 'domain',
    query: input.value.trim()
  };
};

const BADGE_CONFIG = {
  premium: {
    title: 'Premium',
    badgeClass:
      'px-2 py-0.5 rounded bg-blue-50 text-op-blue text-[10px] font-bold uppercase tracking-widest',
    cardClass: ''
  },
  hot: {
    title: 'Hot',
    badgeClass:
      'px-2 py-0.5 rounded bg-op-red text-white text-[10px] font-bold uppercase tracking-widest',
    cardClass: 'ring-2 ring-op-red/10'
  },
  standard: {
    title: 'Standard',
    badgeClass:
      'px-2 py-0.5 rounded bg-slate-200 text-slate-600 text-[10px] font-bold uppercase tracking-widest',
    cardClass: 'bg-slate-50/50'
  }
};

const pickPrimaryBadge = (labels = []) => {
  let badge = 'standard';
  const extras = [];
  labels.forEach((label) => {
    const normalized = typeof label === 'string' ? label.trim().toLowerCase() : '';
    if ((normalized === 'premium' || normalized === 'hot' || normalized === 'standard') && badge === 'standard') {
      badge = normalized;
      return;
    }
    if (label) {
      extras.push(label);
    }
  });
  return { badge, extras };
};

const formatPriceAmount = (value, currency) => {
  if (!Number.isFinite(value)) {
    return 'Unknown price';
  }
  const formatted = value.toFixed(2);
  return `${formatted} ${currency || ''}`.trim();
};

const appendResponse = (response) => {
  if (!response || !response.price) {
    return false;
  }
  const { price } = response;
  const { badge, extras } = pickPrimaryBadge(price.labels);
  const badgeConfig = BADGE_CONFIG[badge] ?? BADGE_CONFIG.standard;

  const card = document.createElement('article');
  card.className =
    'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4';
  if (badgeConfig.cardClass) {
    card.classList.add(...badgeConfig.cardClass.split(' '));
  }

  const header = document.createElement('div');
  header.className = 'flex justify-between items-start gap-4';

  const titleWrapper = document.createElement('div');
  const title = document.createElement('h3');
  title.className = 'text-xl font-extrabold mb-1 text-slate-900';
  title.textContent = price.domain || 'Unknown domain';
  titleWrapper.appendChild(title);

  const badgeEl = document.createElement('span');
  badgeEl.className = badgeConfig.badgeClass;
  badgeEl.textContent = badgeConfig.title;
  titleWrapper.appendChild(badgeEl);
  header.appendChild(titleWrapper);

  const priceWrapper = document.createElement('div');
  priceWrapper.className = 'text-right';

  const availability = document.createElement('div');
  const available = Boolean(price.availability);
  availability.className = `${available ? 'text-green-600' : 'text-slate-500'} flex items-center gap-1 text-[11px] font-bold uppercase`;
  const availabilityIcon = document.createElement('span');
  availabilityIcon.className = 'material-symbols-outlined text-sm';
  availabilityIcon.textContent = available ? 'check_circle' : 'lock';
  availability.appendChild(availabilityIcon);
  availability.appendChild(document.createTextNode(available ? ' Available' : ' Already Taken'));
  priceWrapper.appendChild(availability);

  const priceLine = document.createElement('div');
  priceLine.className = `${available ? 'text-2xl text-slate-900' : 'text-lg text-slate-400'} font-extrabold`;
  const mainAmount = document.createElement('span');
  mainAmount.textContent = formatPriceAmount(price.cost, price.currency);
  priceLine.appendChild(mainAmount);

  const perYear = document.createElement('span');
  perYear.className = 'text-xs font-medium text-slate-400 ml-1';
  perYear.textContent = '/yr';
  priceLine.appendChild(perYear);

  if (Number.isFinite(price.renewalCost) && price.renewalCost > price.cost) {
    const compare = document.createElement('span');
    compare.className = 'text-xs font-medium text-slate-400 line-through ml-2';
    compare.textContent = formatPriceAmount(price.renewalCost, price.currency);
    priceLine.appendChild(compare);
  }

  priceWrapper.appendChild(priceLine);
  header.appendChild(priceWrapper);
  card.appendChild(header);

  if (extras.length) {
    const chipRow = document.createElement('div');
    chipRow.className = 'flex gap-2 flex-wrap border-t border-slate-100 dark:border-slate-800 pt-3';
    extras.forEach((label) => {
      const lbl = document.createElement('span');
      lbl.className =
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
      lbl.textContent = label;
      chipRow.appendChild(lbl);
    });
    card.appendChild(chipRow);
  }

  const stats = document.createElement('div');
  stats.className = 'space-y-4';
  const scoreMeta = document.createElement('div');
  scoreMeta.className = 'flex items-center justify-between text-[11px] font-bold uppercase tracking-tight';
  const scoreLabel = document.createElement('span');
  scoreLabel.className = 'text-op-blue flex items-center gap-1';
  scoreLabel.innerHTML = '<span class="material-symbols-outlined text-sm">analytics</span> AI Match Score';
  scoreMeta.appendChild(scoreLabel);
  const scoreValue = document.createElement('span');
  const scorePercent = Number.isFinite(price.similarityScore) ? price.similarityScore * 100 : 0;
  scoreValue.className = 'text-slate-900';
  scoreValue.textContent = `${scorePercent.toFixed(0)}%`;
  scoreMeta.appendChild(scoreValue);
  stats.appendChild(scoreMeta);

  const scoreBarWrapper = document.createElement('div');
  scoreBarWrapper.className = 'h-2 w-full match-bar-bg rounded-full overflow-hidden';
  const scoreBar = document.createElement('div');
  scoreBar.className = 'h-full match-bar-fill rounded-full';
  scoreBar.style.width = `${Math.max(0, Math.min(100, scorePercent))}%`;
  scoreBarWrapper.appendChild(scoreBar);
  stats.appendChild(scoreBarWrapper);

  const cta = document.createElement('button');
  cta.className =
    'w-full mt-2 py-3.5 bg-op-blue text-white font-bold rounded-lg flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors shadow-sm';
  cta.innerHTML = '<span class="material-symbols-outlined text-lg">add_shopping_cart</span> Add to Cart';
  stats.appendChild(cta);

  card.appendChild(stats);
  list.appendChild(card);
  resultsSection.classList.remove('hidden');
  return true;
};

const handleSubmit = (event) => {
  event.preventDefault();
  const query = input.value.trim();
  if (!query) {
    setStatus('Please enter a keyword.', 'warning');
    input.focus();
    return;
  }

  if (activeAbortController) {
    activeAbortController.abort();
  }
  const controller = new AbortController();
  activeAbortController = controller;

  clearResults();
  setStatus('Streaming product prices…', 'info');
  submitButton.disabled = true;

  const payload = buildRequestPayload();

  (async () => {
    try {
      let count = 0;
      for await (const response of streamSearchPrices(payload, controller.signal)) {
        if (!appendResponse(response)) {
          continue;
        }
        count += 1;
        setStatus(`Received ${count} response${count === 1 ? '' : 's'}…`, 'info');
      }
      if (count === 0) {
        setStatus('No responses returned. Try another keyword.', 'warning');
      } else {
        setStatus(`Stream complete.`, 'success');
      }
    } catch (error) {
      if (controller.signal.aborted) {
        setStatus('Cancelled current stream.', 'warning');
        return;
      }
      console.error(error);
      setStatus(error.message || 'Unable to reach the gRPC service.', 'error');
    } finally {
      if (activeAbortController === controller) {
        activeAbortController = null;
        submitButton.disabled = false;
      }
    }
  })();
};

form.addEventListener('submit', handleSubmit);
