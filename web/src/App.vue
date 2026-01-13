<template>
  <div class="bg-op-gray-light text-op-text min-h-screen">
    <div class="relative flex h-auto w-full flex-col overflow-x-hidden">
      <header class="glass-header px-6 lg:px-20 py-4 flex items-center justify-between sticky top-0 z-50">
        <div class="flex items-center gap-3">
          <div class="size-8 bg-op-blue rounded-lg flex items-center justify-center text-white">
            <span class="material-symbols-outlined text-xl">temp_preferences_custom</span>
          </div>
          <h1 class="text-xl font-extrabold tracking-tight text-slate-900">
            OpenProvider <span class="text-op-blue">AI</span>
          </h1>
        </div>
        <div class="flex items-center gap-4">
          <button class="p-2 hover:bg-slate-200 rounded-full transition-colors relative" type="button">
            <span class="material-symbols-outlined">shopping_cart</span>
            <span class="absolute top-1 right-1 size-2 bg-op-red rounded-full border-2 border-white"></span>
          </button>
          <button class="p-2 hover:bg-slate-200 rounded-full transition-colors" type="button">
            <span class="material-symbols-outlined">account_circle</span>
          </button>
        </div>
      </header>
      <main class="flex-1 max-w-[1400px] mx-auto w-full px-6 lg:px-20 py-12">
        <section class="flex flex-col items-center text-center mb-16">
          <div
            class="mb-6 inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-op-blue text-[11px] font-bold uppercase tracking-wider">
            <span class="material-symbols-outlined text-sm">auto_awesome</span>
            AI-Powered Intelligence
          </div>
          <h2 class="text-4xl md:text-5xl lg:text-6xl font-extrabold mb-6 max-w-4xl leading-[1.1] text-slate-900">
            The smarter way to find your <span class="text-op-blue">perfect domain</span>
          </h2>
          <p class="text-slate-600 text-lg mb-10 max-w-2xl font-medium">
            Describe your project in plain English. Our AI analyzes your needs to suggest high-impact domain names and TLD
            strategies.
          </p>
          <form id="search-form" class="w-full max-w-3xl relative group" @submit.prevent="handleSubmit">
            <div
              class="relative flex items-center bg-white p-1.5 rounded-xl border-2 border-slate-200 focus-within:border-op-blue shadow-lg transition-all">
              <div class="pl-4 pr-2 text-slate-400">
                <span class="material-symbols-outlined">psychology</span>
              </div>
              <input
                v-model.trim="query"
                class="flex-1 bg-transparent border-none focus:ring-0 text-lg py-4 placeholder:text-slate-400 font-medium"
                id="query"
                name="query"
                type="text"
                autocomplete="off"
                required
                placeholder="Describe your business idea (e.g. eco-friendly yoga studio in Amsterdam)"
              />
              <button
                type="submit"
                class="bg-op-blue hover:bg-blue-700 text-white font-bold px-10 py-4 rounded-lg flex items-center gap-2 transition-all shadow-md disabled:opacity-60"
                :disabled="isStreaming"
              >
                <span>{{ isStreaming ? 'Streaming…' : 'Search' }}</span>
                <span class="material-symbols-outlined text-sm">search</span>
              </button>
            </div>
            <div
              id="search-indicator"
              class="mt-4 flex items-center gap-2 text-sm font-semibold text-op-blue"
              :class="{ streaming: isStreaming }"
              aria-live="polite"
            >
              <span class="material-symbols-outlined animate-spin text-base">progress_activity</span>
              <span>Looking for matching domains…</span>
            </div>
            <p
              v-if="statusMessage"
              class="mt-4 text-sm font-semibold text-left status-pill"
              :class="statusClass"
              role="status"
              aria-live="polite"
            >
              {{ statusMessage }}
            </p>
          </form>
          <div class="flex flex-wrap justify-center gap-3 mt-8">
            <button
              class="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white border border-slate-200 text-sm font-semibold hover:border-op-blue transition-all"
              type="button"
            >
              Popular TLDs <span class="material-symbols-outlined text-sm">expand_more</span>
            </button>
            <button class="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-op-blue text-white text-sm font-bold shadow-sm" type="button">
              .ai <span class="material-symbols-outlined text-xs">check</span>
            </button>
            <button
              class="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white border border-slate-200 text-sm font-semibold hover:border-op-blue transition-all"
              type="button"
            >
              .com <span class="material-symbols-outlined text-sm">expand_more</span>
            </button>
            <div class="w-px h-8 bg-slate-300 mx-2 hidden sm:block"></div>
            <button
              class="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white border border-slate-200 text-sm font-semibold hover:border-op-blue transition-all"
              type="button"
            >
              Professional
            </button>
            <button
              class="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-white border border-slate-200 text-sm font-semibold hover:border-op-blue transition-all"
              type="button"
            >
              Catchy
            </button>
          </div>
        </section>

        <section v-if="hasResults" class="flex flex-col lg:flex-row gap-10">
          <div class="flex-1 space-y-6">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h3 class="text-2xl font-extrabold text-slate-900 flex items-center gap-3">
                Recommended for you
                <span class="text-xs font-bold text-slate-500 bg-slate-200/50 px-3 py-1 rounded-full uppercase tracking-tighter">
                  {{ suggestions.length }} Domains
                </span>
              </h3>
              <p class="text-sm font-semibold text-slate-600">
                Showing results for <span class="text-op-blue">"{{ query }}"</span>
              </p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6" aria-live="polite">
              <article
                v-for="card in suggestions"
                :key="card.key"
                class="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-4"
                :class="card.cardClass"
              >
                <div class="flex justify-between items-start gap-4">
                  <div>
                    <h3 class="text-xl font-extrabold mb-1 text-slate-900">{{ card.domain }}</h3>
                    <span :class="card.badgeClass">{{ card.badgeTitle }}</span>
                  </div>
                  <div class="text-right">
                    <div
                      class="flex items-center gap-1 text-[11px] font-bold uppercase"
                      :class="card.availability ? 'text-green-600' : 'text-slate-500'"
                    >
                      <span class="material-symbols-outlined text-sm">{{ card.availability ? 'check_circle' : 'lock' }}</span>
                      <span>{{ card.availability ? 'Available' : 'Already Taken' }}</span>
                    </div>
                    <div
                      class="font-extrabold"
                      :class="card.availability ? 'text-2xl text-slate-900' : 'text-lg text-slate-400'"
                    >
                      <span>{{ card.amount }}</span>
                      <span class="text-xs font-medium text-slate-400 ml-1">/yr</span>
                      <span
                        v-if="card.showRenewal"
                        class="text-xs font-medium text-slate-400 line-through ml-2"
                      >
                        {{ card.renewalAmount }}
                      </span>
                    </div>
                  </div>
                </div>
                <div v-if="card.extras.length" class="flex gap-2 flex-wrap border-t border-slate-100 pt-3">
                  <span
                    v-for="extra in card.extras"
                    :key="extra"
                    class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600"
                  >
                    {{ extra }}
                  </span>
                </div>
                <div class="space-y-4">
                  <div class="flex items-center justify-between text-[11px] font-bold uppercase tracking-tight">
                    <span class="text-op-blue flex items-center gap-1">
                      <span class="material-symbols-outlined text-sm">analytics</span>
                      AI Match Score
                    </span>
                    <span class="text-slate-900">{{ card.scorePercent }}%</span>
                  </div>
                  <div class="h-2 w-full match-bar-bg rounded-full overflow-hidden">
                    <div class="h-full match-bar-fill rounded-full" :style="{ width: `${card.scorePercent}%` }"></div>
                  </div>
                  <button
                    class="w-full mt-2 py-3.5 bg-op-blue text-white font-bold rounded-lg flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors shadow-sm"
                    type="button"
                  >
                    <span class="material-symbols-outlined text-lg">add_shopping_cart</span>
                    Add to Cart
                  </button>
                </div>
              </article>
            </div>
          </div>
          <aside class="w-full lg:w-[340px] space-y-8">
            <div class="op-card rounded-xl p-8">
              <h4 class="font-extrabold text-lg mb-6 flex items-center gap-2 text-slate-900">
                <span class="material-symbols-outlined text-op-blue">tune</span>
                Fine-tune results
              </h4>
              <div class="space-y-6">
                <div>
                  <p class="text-[11px] font-bold text-slate-400 uppercase mb-3 tracking-widest">Project Vibes</p>
                  <div class="flex flex-wrap gap-2">
                    <button class="px-3 py-1.5 rounded-md border border-slate-200 text-xs font-bold text-slate-700" type="button">
                      Modern
                    </button>
                    <button class="px-3 py-1.5 rounded-md border border-slate-200 text-xs font-bold text-slate-700" type="button">
                      Playful
                    </button>
                    <button class="px-3 py-1.5 rounded-md border border-slate-200 text-xs font-bold text-slate-700" type="button">
                      Luxurious
                    </button>
                    <button class="px-3 py-1.5 rounded-md border border-slate-200 text-xs font-bold text-slate-700" type="button">
                      Trustworthy
                    </button>
                  </div>
                </div>
                <div>
                  <p class="text-[11px] font-bold text-slate-400 uppercase mb-3 tracking-widest">Modify Prompt</p>
                  <ul class="space-y-3">
                    <li class="flex items-center justify-between text-sm font-semibold text-slate-600">
                      <span>Add "Health" keyword</span>
                      <span class="material-symbols-outlined text-sm">add_circle</span>
                    </li>
                    <li class="flex items-center justify-between text-sm font-semibold text-slate-600">
                      <span>Focus on mobile app</span>
                      <span class="material-symbols-outlined text-sm">add_circle</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
            <div class="rounded-xl overflow-hidden relative group cursor-pointer shadow-lg border border-op-blue/10">
              <div class="absolute inset-0 bg-op-blue"></div>
              <div
                class="absolute inset-0 bg-center bg-cover mix-blend-soft-light opacity-30"
                style="background-image: url('https://lh3.googleusercontent.com/aida-public/AB6AXuCdF5Kzn2jck4flRYUdt1Pp5svnxtwJPG-gId-qInjPd8q9Pv0f6hUdAdNlNF8sBJc5LCl2uV4j2wcLHfePAtlbnb9C9lmcxcR5nmfdOMbAvYmmkBh0-XSZE5eeHg3wR2tF8k9ghPerSfHihMmIi7jT8c66tPxQXbMSEQ8LueGJbjxY6fmvwDk5fUuvEweJwodXmCQtw3gO8LVSlkjh7SKAgLk6yU6qnytMgB0y7PafVMjMLxOQWIuDIqjT8sBr9--fLlK2kLDk7uc');"
              ></div>
              <div class="relative p-8 text-white">
                <div class="w-12 h-12 bg-white/10 rounded-lg flex items-center justify-center mb-6 backdrop-blur-md">
                  <span class="material-symbols-outlined text-white text-3xl">dns</span>
                </div>
                <h5 class="text-xl font-extrabold mb-3 leading-tight">Bundle with Managed Hosting</h5>
                <p class="text-sm text-white/90 mb-8 font-medium">Claim your domain for free when you sign up for an annual hosting plan today.</p>
                <button class="w-full py-3.5 bg-white text-op-blue font-extrabold rounded-lg text-sm" type="button">Explore Plans</button>
              </div>
            </div>
            <div class="p-8 bg-white border border-slate-200 rounded-xl">
              <h4 class="font-extrabold mb-4 text-sm text-slate-900 uppercase tracking-wide">Market Insight</h4>
              <p class="text-sm text-slate-600 leading-relaxed font-medium">
                Domains ending in <span class="text-op-blue font-bold">.ai</span> have seen a
                <span class="text-op-red font-bold">65% increase</span> in registration volume within the health &amp; wellness sector this year.
              </p>
            </div>
          </aside>
        </section>

        <section v-else class="mt-16 text-center text-slate-500 font-semibold">
          <p>Share a bit about your project to let our AI find high-impact domain ideas.</p>
        </section>
      </main>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, ref } from 'vue';
import { streamSearchPrices } from './lib/grpc-client';

const query = ref('');
const suggestions = ref([]);
const statusMessage = ref('');
const statusVariant = ref('info');
const isStreaming = ref(false);
let activeAbortController = null;

let cardSequence = 0;

const BADGE_CONFIG = {
  premium: {
    title: 'Premium',
    badgeClass: 'px-2 py-0.5 rounded bg-blue-50 text-op-blue text-[10px] font-bold uppercase tracking-widest',
    cardClass: '',
  },
  hot: {
    title: 'Hot',
    badgeClass: 'px-2 py-0.5 rounded bg-op-red text-white text-[10px] font-bold uppercase tracking-widest',
    cardClass: 'ring-2 ring-op-red/10',
  },
  standard: {
    title: 'Standard',
    badgeClass: 'px-2 py-0.5 rounded bg-slate-200 text-slate-600 text-[10px] font-bold uppercase tracking-widest',
    cardClass: 'bg-slate-50/50',
  },
};

const statusClass = computed(() => {
  switch (statusVariant.value) {
    case 'success':
      return 'status-success';
    case 'warning':
      return 'status-warning';
    case 'error':
      return 'status-error';
    default:
      return 'status-info';
  }
});

const hasResults = computed(() => suggestions.value.length > 0);

const setStatus = (message, variant = 'info') => {
  statusMessage.value = message ?? '';
  statusVariant.value = variant;
};

const cancelActiveStream = () => {
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
};

onBeforeUnmount(cancelActiveStream);

const handleSubmit = async () => {
  const keyword = query.value.trim();
  if (!keyword) {
    setStatus('Please enter a keyword.', 'warning');
    return;
  }

  cancelActiveStream();
  suggestions.value = [];
  const controller = new AbortController();
  activeAbortController = controller;
  isStreaming.value = true;
  setStatus('Streaming product prices…', 'info');

  const payload = {
    product: 'domain',
    query: keyword,
  };

  try {
    let count = 0;
    for await (const response of streamSearchPrices(payload, controller.signal)) {
      const card = mapResponseToCard(response);
      if (!card) {
        continue;
      }
      suggestions.value = [...suggestions.value, card];
      count += 1;
      setStatus(`Received ${count} response${count === 1 ? '' : 's'}…`, 'info');
    }
    if (count === 0) {
      setStatus('No responses returned. Try another keyword.', 'warning');
    } else {
      setStatus('Stream complete.', 'success');
    }
  } catch (error) {
    if (controller.signal.aborted) {
      setStatus('Cancelled current stream.', 'warning');
    } else {
      console.error(error);
      setStatus(error?.message || 'Unable to reach the gRPC service.', 'error');
    }
  } finally {
    if (activeAbortController === controller) {
      activeAbortController = null;
    }
    isStreaming.value = false;
  }
};

const mapResponseToCard = (response) => {
  const price = response?.price;
  if (!price) {
    return null;
  }
  const { badge, extras } = pickPrimaryBadge(price.labels || []);
  const badgeConfig = BADGE_CONFIG[badge] ?? BADGE_CONFIG.standard;
  const cost = toNumber(price.cost);
  const renewalCost = toNumber(price.renewalCost);

  return {
    key: `${price.domain || 'domain'}-${cardSequence++}`,
    domain: price.domain || 'Unknown domain',
    badgeTitle: badgeConfig.title,
    badgeClass: badgeConfig.badgeClass,
    cardClass: badgeConfig.cardClass,
    availability: Boolean(price.availability),
    amount: formatPriceAmount(cost, price.currency),
    showRenewal: Number.isFinite(renewalCost) && Number.isFinite(cost) && renewalCost > cost,
    renewalAmount: formatPriceAmount(renewalCost, price.currency),
    extras,
    scorePercent: scoreToPercent(price.similarityScore),
  };
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

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
};

const formatPriceAmount = (value, currency) => {
  if (!Number.isFinite(value)) {
    return 'Unknown price';
  }
  const formatted = value.toFixed(2);
  return `${formatted} ${currency || ''}`.trim();
};

const scoreToPercent = (score) => {
  if (!Number.isFinite(score)) {
    return 0;
  }
  const pct = Math.round(score * 100);
  return Math.min(100, Math.max(0, pct));
};
</script>
