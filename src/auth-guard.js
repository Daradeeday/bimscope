import { auth, signOut, onAuthStateChanged } from './firebase.js';

/**
 * Auth Guard — blocks access to app.html for unauthenticated users.
 * Shows a loading overlay while checking auth state, then either
 * reveals the app or redirects to login.
 */

let currentUser = null;

export function initAuthGuard() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (!user) {
        window.location.href = './login.html';
        return;
      }
      currentUser = user;
      // Remove auth-checking overlay
      const overlay = document.getElementById('authChecking');
      if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.remove(), 300);
      }
      // Populate user menu
      populateUserMenu(user);
      resolve(user);
    });
  });
}

function populateUserMenu(user) {
  const avatarBtn = document.getElementById('userAvatarBtn');
  const dropdown = document.getElementById('userDropdown');
  const avatarEl = document.getElementById('userAvatar');
  const nameEl = document.getElementById('userDisplayName');
  const emailEl = document.getElementById('userEmail');
  const dropdownName = document.getElementById('dropdownDisplayName');
  const dropdownEmail = document.getElementById('dropdownEmail');

  if (!avatarBtn) return;

  const displayName = user.displayName || user.email?.split('@')[0] || 'User';
  const email = user.email || '';
  const photoURL = user.photoURL;

  // Set avatar
  if (photoURL) {
    avatarEl.innerHTML = '<img src="' + photoURL + '" alt="' + displayName + '" referrerpolicy="no-referrer" />';
  } else {
    avatarEl.textContent = displayName.charAt(0).toUpperCase();
  }

  // Set name
  if (nameEl) nameEl.textContent = displayName;
  if (dropdownName) dropdownName.textContent = displayName;
  if (dropdownEmail) dropdownEmail.textContent = email;

  // Show user menu
  avatarBtn.style.display = 'flex';

  // Toggle dropdown
  avatarBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('is-open');
  });

  // Close dropdown on outside click
  document.addEventListener('click', () => {
    dropdown.classList.remove('is-open');
  });

  dropdown.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  // Logout button
  const btnLogout = document.getElementById('btnLogout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      try {
        await signOut(auth);
        window.location.href = './login.html';
      } catch (err) {
        console.error('Logout error:', err);
      }
    });
  }
}

export function getCurrentUser() {
  return currentUser;
}
