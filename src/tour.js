/**
 * Guided Tour — step-by-step popup walkthrough of the app UI.
 * Each step targets a DOM element, shows a title + description + optional GIF,
 * and highlights the target with a spotlight effect.
 */

const TOUR_STEPS = [
  {
    target: null, // center of screen — welcome
    title: 'Welcome to BIMSCOPE',
    desc: 'This quick tour will walk you through the main features of the IFC viewer. Click <b>Next</b> to continue or <b>Skip</b> to close.',
    gif: null,
    position: 'center',
  },
  {
    target: '#ifcFile',
    title: '1) Load IFC File',
    desc: 'Click <b>Choose File</b> to select an <code>.ifc</code> file from your computer, then press <b>Load</b> to parse and display the 3D model.',
    gif: null,
    position: 'right',
  },
  {
    target: '#metadataFile',
    title: 'Optional: Load Metadata',
    desc: 'You can also load a <b>JSON metadata file</b> exported from pyRevit. This provides accurate room coordinates, areas, and volumes.',
    gif: null,
    position: 'right',
  },
  {
    target: '#viewer3d',
    title: '3D Viewport',
    desc: 'This is the 3D viewport where your IFC model is rendered. Use <b>left-click drag</b> to orbit, <b>right-click drag</b> to pan, and <b>scroll</b> to zoom. <b>Double-click</b> on any element to inspect it.',
    gif: null,
    position: 'left',
  },
  {
    target: '#btnListTypes',
    title: '2) Quick Queries',
    desc: '<b>List Types</b> shows a summary of IFC entity counts (sites, buildings, storeys, spaces). <b>List IfcSpace</b> shows all rooms in the model.',
    gif: null,
    position: 'right',
  },
  {
    target: '#expressId',
    title: '3) Inspect by ExpressID',
    desc: 'Enter an <b>ExpressID</b> number and click <b>Inspect</b> to view the raw IFC data. Use <b>Property Sets</b> and <b>Type Properties</b> for detailed attributes.',
    gif: null,
    position: 'right',
  },
  {
    target: '#spaceSelect',
    title: '4) Rooms & Section Box',
    desc: 'Select a room from the dropdown, choose a display mode (<b>Highlight</b> or <b>Section Box</b>), then click <b>Go to Room</b> to fly the camera to that room.',
    gif: null,
    position: 'right',
  },
  {
    target: '#storeySelect',
    title: '5) Level Views',
    desc: 'Select a storey/level to create a <b>section cut</b> that shows only that level and everything below. Adjust the <b>Top Offset</b> to fine-tune the cut height.',
    gif: null,
    position: 'right',
  },
  {
    target: '#btnExportJSON',
    title: '6) Export Data',
    desc: 'Export all room data as <b>JSON</b> or <b>CSV</b> files. If metadata was loaded, the export includes coordinates, areas, and volumes.',
    gif: null,
    position: 'right',
  },
  {
    target: '#btnIsoView',
    title: 'View Controls',
    desc: 'Switch between <b>Perspective</b> and <b>Isometric</b> views, or click <b>Reset View</b> to return to the default camera position.',
    gif: null,
    position: 'bottom',
  },
  {
    target: '#languageButton',
    title: 'Language Switcher',
    desc: 'Click here to switch the interface language between <b>English</b> and <b>Thai (ภาษาไทย)</b>.',
    gif: null,
    position: 'bottom',
  },
  {
    target: '#output',
    title: 'Output Panel',
    desc: 'Query results, inspection data, and status messages appear here. You can resize this panel by dragging the divider above it.',
    gif: null,
    position: 'top',
  },
  {
    target: null,
    title: 'You\'re All Set!',
    desc: 'You now know the basics of BIMSCOPE. Load an IFC file to get started! You can reopen this tour anytime by clicking the <b>?</b> button in the top bar.',
    gif: null,
    position: 'center',
  },
];

let currentStep = 0;
let overlay = null;
let popup = null;
let spotlightHole = null;
let isOpen = false;

function createTourDOM() {
  // Overlay with spotlight hole
  overlay = document.createElement('div');
  overlay.className = 'tour-overlay';
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeTour();
  });

  // Spotlight SVG mask
  spotlightHole = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  spotlightHole.setAttribute('class', 'tour-spotlight-svg');
  spotlightHole.innerHTML = `
    <defs>
      <mask id="tour-mask">
        <rect x="0" y="0" width="100%" height="100%" fill="white"/>
        <rect id="tour-hole" x="0" y="0" width="0" height="0" rx="8" ry="8" fill="black"/>
      </mask>
    </defs>
    <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.55)" mask="url(#tour-mask)"/>
  `;
  overlay.appendChild(spotlightHole);

  // Popup
  popup = document.createElement('div');
  popup.className = 'tour-popup';
  popup.innerHTML = `
    <button class="tour-close" aria-label="Close tour">&times;</button>
    <div class="tour-gif-container" style="display:none;">
      <img class="tour-gif" src="" alt="Feature demo" />
    </div>
    <h4 class="tour-title"></h4>
    <p class="tour-desc"></p>
    <div class="tour-footer">
      <span class="tour-counter"></span>
      <div class="tour-actions">
        <button class="tour-btn tour-btn--ghost tour-prev">Back</button>
        <button class="tour-btn tour-btn--primary tour-next">Next</button>
      </div>
    </div>
  `;

  popup.querySelector('.tour-close').addEventListener('click', closeTour);
  popup.querySelector('.tour-prev').addEventListener('click', prevStep);
  popup.querySelector('.tour-next').addEventListener('click', nextStep);

  overlay.appendChild(popup);
  document.body.appendChild(overlay);
}

function destroyTourDOM() {
  if (overlay) {
    overlay.remove();
    overlay = null;
    popup = null;
    spotlightHole = null;
  }
}

function renderStep() {
  if (!popup || !overlay) return;
  const step = TOUR_STEPS[currentStep];
  if (!step) return;

  const total = TOUR_STEPS.length;

  // Update content
  popup.querySelector('.tour-title').textContent = step.title;
  popup.querySelector('.tour-desc').innerHTML = step.desc;
  popup.querySelector('.tour-counter').textContent = `${currentStep + 1} / ${total}`;

  // GIF
  const gifContainer = popup.querySelector('.tour-gif-container');
  const gifImg = popup.querySelector('.tour-gif');
  if (step.gif) {
    gifImg.src = step.gif;
    gifContainer.style.display = '';
  } else {
    gifContainer.style.display = 'none';
    gifImg.src = '';
  }

  // Buttons
  const prevBtn = popup.querySelector('.tour-prev');
  const nextBtn = popup.querySelector('.tour-next');
  prevBtn.style.display = currentStep === 0 ? 'none' : '';
  nextBtn.textContent = currentStep === total - 1 ? 'Finish' : 'Next';

  // Spotlight + position
  const hole = document.getElementById('tour-hole');
  const target = step.target ? document.querySelector(step.target) : null;

  if (target) {
    // Ensure the target's parent card is open so it's visible
    const card = target.closest('.card--collapsible');
    if (card && !card.classList.contains('is-open')) {
      card.classList.add('is-open');
      const heading = card.querySelector('.card-heading');
      if (heading) heading.setAttribute('aria-expanded', 'true');
    }

    // Ensure sidebar is visible
    const app = document.getElementById('app');
    const sidebar = document.getElementById('sidebar');
    if (sidebar && target.closest('.sidebar')) {
      if (app && app.classList.contains('sidebar-closed')) {
        app.classList.remove('sidebar-closed');
        app.classList.add('sidebar-open');
      }
    }

    // Scroll target into view
    target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Wait a tick for layout
    requestAnimationFrame(() => {
      const rect = target.getBoundingClientRect();
      const pad = 6;
      hole.setAttribute('x', rect.left - pad);
      hole.setAttribute('y', rect.top - pad);
      hole.setAttribute('width', rect.width + pad * 2);
      hole.setAttribute('height', rect.height + pad * 2);

      positionPopup(rect, step.position);
    });
  } else {
    // Center — no spotlight
    hole.setAttribute('width', 0);
    hole.setAttribute('height', 0);
    positionPopupCenter();
  }
}

function positionPopup(targetRect, preferredPos) {
  if (!popup) return;

  // Reset
  popup.style.left = '';
  popup.style.top = '';
  popup.style.right = '';
  popup.style.bottom = '';
  popup.style.transform = '';

  const popupW = 360;
  const gap = 16;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left, top;

  if (preferredPos === 'right') {
    left = targetRect.right + gap;
    top = targetRect.top + targetRect.height / 2;
    // If overflows right, flip to left
    if (left + popupW > vw - 16) {
      left = targetRect.left - gap - popupW;
    }
    // Clamp vertical
    top = Math.max(16, Math.min(top, vh - 300));
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
    popup.style.transform = 'translateY(-30%)';
  } else if (preferredPos === 'left') {
    left = targetRect.left - gap - popupW;
    if (left < 16) left = targetRect.right + gap;
    top = targetRect.top + targetRect.height / 2;
    top = Math.max(16, Math.min(top, vh - 300));
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
    popup.style.transform = 'translateY(-30%)';
  } else if (preferredPos === 'bottom') {
    left = targetRect.left + targetRect.width / 2 - popupW / 2;
    left = Math.max(16, Math.min(left, vw - popupW - 16));
    top = targetRect.bottom + gap;
    if (top + 200 > vh) top = targetRect.top - gap - 200;
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
  } else if (preferredPos === 'top') {
    left = targetRect.left + targetRect.width / 2 - popupW / 2;
    left = Math.max(16, Math.min(left, vw - popupW - 16));
    top = targetRect.top - gap;
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
    popup.style.transform = 'translateY(-100%)';
  } else {
    positionPopupCenter();
  }
}

function positionPopupCenter() {
  if (!popup) return;
  popup.style.left = '50%';
  popup.style.top = '50%';
  popup.style.right = '';
  popup.style.bottom = '';
  popup.style.transform = 'translate(-50%, -50%)';
}

function nextStep() {
  if (currentStep < TOUR_STEPS.length - 1) {
    currentStep++;
    renderStep();
  } else {
    closeTour();
  }
}

function prevStep() {
  if (currentStep > 0) {
    currentStep--;
    renderStep();
  }
}

export function openTour() {
  if (isOpen) return;
  isOpen = true;
  currentStep = 0;
  createTourDOM();
  renderStep();

  // Handle keyboard
  document.addEventListener('keydown', onTourKey);

  // Handle resize
  window.addEventListener('resize', onTourResize);
}

export function closeTour() {
  isOpen = false;
  destroyTourDOM();
  document.removeEventListener('keydown', onTourKey);
  window.removeEventListener('resize', onTourResize);
}

function onTourKey(e) {
  if (e.key === 'Escape') closeTour();
  if (e.key === 'ArrowRight' || e.key === 'Enter') nextStep();
  if (e.key === 'ArrowLeft') prevStep();
}

function onTourResize() {
  if (isOpen) renderStep();
}

/**
 * Set a GIF URL for a specific step (0-indexed).
 * Call this before or after openTour().
 */
export function setStepGif(stepIndex, gifUrl) {
  if (stepIndex >= 0 && stepIndex < TOUR_STEPS.length) {
    TOUR_STEPS[stepIndex].gif = gifUrl;
  }
}

/**
 * Get the tour steps array (for external customization).
 */
export function getTourSteps() {
  return TOUR_STEPS;
}
