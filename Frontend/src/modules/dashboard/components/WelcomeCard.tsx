import defaultAvatar from "@/assets/default-avatar.svg";

function greetingForHour(hour: number) {
  if (hour < 12) return "Good Morning";
  if (hour < 17) return "Good Afternoon";
  return "Good Evening";
}

type WelcomeCardProps = {
  name: string;
  avatarUrl?: string;
};

export default function WelcomeCard({ name, avatarUrl }: WelcomeCardProps) {
  const greeting = greetingForHour(new Date().getHours());

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-brand-dark p-5 text-white shadow-sm xs:p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-normal leading-snug opacity-90">{greeting}</p>
          <p className="mt-0.5 truncate text-2xl font-semibold leading-tight tracking-tight xs:text-3xl">
            {name}!
          </p>
        </div>

        {/* Real profile picture when available; otherwise a photo-style default
            avatar, rather than a generic line-icon. */}
        <img
          src={avatarUrl || defaultAvatar}
          alt={name}
          className="h-14 w-14 shrink-0 rounded-full border-2 border-white/70 object-cover shadow-md xs:h-16 xs:w-16"
        />
      </div>
    </div>
  );
}
