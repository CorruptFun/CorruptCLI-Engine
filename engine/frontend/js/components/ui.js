/**
 * Corrupt Engine UI Component Library
 * Reusable components for consistent branding and performance.
 */

export const Button = (text, onClick, style = 'primary') => {
    const btn = document.createElement('button');
    btn.innerText = text;
    btn.onclick = onClick;
    
    const styles = {
        primary: 'bg-primary-main text-black hover:bg-primary-light font-medium py-2 px-6 rounded-xl transition-all',
        secondary: 'bg-white/5 text-white border border-white/10 hover:bg-white/10 py-2 px-6 rounded-xl transition-all',
        danger: 'bg-red-600 text-white hover:bg-red-700 py-2 px-6 rounded-xl transition-all'
    };
    
    btn.className = styles[style] || styles.primary;
    return btn;
};

export const Card = (title, content, footer = null) => {
    const card = document.createElement('div');
    card.className = 'bg-white/5 border border-white/10 p-6 rounded-2xl shadow-xl backdrop-blur-sm';
    
    card.innerHTML = `
        <h3 class="text-xl font-semibold text-white mb-2">${title}</h3>
        <div class="text-gray-400 mb-4">${content}</div>
    `;
    
    if (footer) {
        const footDiv = document.createElement('div');
        footDiv.className = 'mt-4 pt-4 border-t border-white/5';
        footDiv.appendChild(footer);
        card.appendChild(footDiv);
    }
    
    return card;
};

export const Modal = (title, content, onClose) => {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4';
    
    const modal = document.createElement('div');
    modal.className = 'bg-black border border-white/10 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl';
    
    modal.innerHTML = `
        <div class="p-6 border-b border-white/10 flex justify-between items-center">
            <h2 class="text-2xl font-bold text-white">${title}</h2>
            <button id="close-modal" class="text-gray-400 hover:text-white transition">✕</button>
        </div>
        <div class="p-6 max-h-[70vh] overflow-y-auto">
            ${content}
        </div>
    `;
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    overlay.querySelector('#close-modal').onclick = () => {
        document.body.removeChild(overlay);
        if (onClose) onClose();
    };
    
    return overlay;
};
