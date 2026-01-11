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

const formatPriceAmount = (price) => {
  if (!price) {
    return 'Unknown price';
  }
  if (price.value) {
    return `${price.value} ${price.currencyCode || ''}`.trim();
  }
  const units = Number(price.units ?? 0);
  const nanos = Number(price.nanos ?? 0);
  const amount = units + nanos / 1e9;
  const formatted = Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
  return `${formatted} ${price.currencyCode || ''}`.trim();
};

const appendResponse = (response) => {
  if (!response || !response.priceData) {
    return false;
  }
  const card = document.createElement('article');
  card.className =
    'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4';

  const header = document.createElement('div');
  header.className = 'flex justify-between items-start gap-4';

  const titleWrapper = document.createElement('div');
  const title = document.createElement('h3');
  title.className = 'text-xl font-bold';
  title.textContent = response.productId || 'Unknown product';
  titleWrapper.appendChild(title);

  const badge = document.createElement('span');
  badge.className = 'inline-flex px-2 py-0.5 text-xs font-semibold rounded-full uppercase bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
  badge.textContent = 'Price';
  titleWrapper.appendChild(badge);

  header.appendChild(titleWrapper);

  card.appendChild(header);

  const entries = Object.entries(response.priceData.prices || {});

  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'text-sm text-slate-500';
    empty.textContent = 'No price entries in this chunk.';
    card.appendChild(empty);
  } else {
    entries.forEach(([key, info]) => {
      const row = document.createElement('div');
      row.className = 'flex flex-col gap-2 border-t border-slate-100 dark:border-slate-800 pt-3';

      const tagRow = document.createElement('div');
      tagRow.className = 'flex items-center justify-between gap-4';

      const heading = document.createElement('strong');
      heading.className = 'text-sm uppercase tracking-wide text-slate-500';
      heading.textContent = 'Price';
      tagRow.appendChild(heading);

      const labelWrapper = document.createElement('div');
      labelWrapper.className = 'flex gap-2 flex-wrap';
      if (info?.labels?.length) {
        info.labels.forEach((label) => {
          const lbl = document.createElement('span');
          lbl.className =
            'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300';
          lbl.textContent = label;
          labelWrapper.appendChild(lbl);
        });
      }
      if (info?.promotion?.period) {
        const promoBadge = document.createElement('span');
        promoBadge.className =
          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary';
        promoBadge.textContent = 'Promotion';
        labelWrapper.appendChild(promoBadge);
      }
      if (labelWrapper.children.length) {
        tagRow.appendChild(labelWrapper);
      }

      row.appendChild(tagRow);

      const amount = document.createElement('p');
      amount.className = 'text-2xl font-bold';
      amount.textContent = formatPriceAmount(info?.price);
      row.appendChild(amount);
      card.appendChild(row);
    });
  }

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
