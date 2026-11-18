const EMOJIS =
  "😀 😃 😄 😁 😆 😅 😂 🤣 🥲 😊 😇 🙂 😉 😍 🥰 😘 😗 😋 😛 😜 🤪 😝 🤗 🤭 🤫 🤔 😐 😑 😶 🙄 😏 😬 😌 😔 😪 😴 😷 🤒 🤕 🥵 🥶 😎 🤓 🥳 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 😤 😡 😠 🤬 😈 💀 👻 👽 🤖 💩 🙈 🙉 🙊 ❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 💕 💖 💗 💘 💯 ✨ 🔥 ⭐ 🌙 ☀️ 🌈 ☔ ⚡ 🎉 🎊 🎁 🎂 🍕 🍔 🍟 🍩 🍫 ☕ 🍵 🥤 🍻 👍 👎 👌 ✌️ 🤞 🤟 🤘 👏 🙌 🙏 💪 👋 🤝 ✍️ 👀 🫶 🏏 ⚽ 🏀 🎾 🏸 🎮 🎧 📷 📞 💬 ✅ ❌ ❓ ❗".split(" ");

export function EmojiPanel({ onPick }: { onPick: (e: string) => void }) {
  return (
    <div className="no-scrollbar grid max-h-56 grid-cols-8 gap-1 overflow-y-auto p-2">
      {EMOJIS.map((e) => (
        <button
          key={e}
          type="button"
          onPointerDown={(ev) => {
            ev.preventDefault();
            onPick(e);
          }}
          className="flex h-10 items-center justify-center rounded-xl text-2xl transition active:scale-90 hover:bg-accent"
        >
          {e}
        </button>
      ))}
    </div>
  );
}
