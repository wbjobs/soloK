import { Users } from 'lucide-react'
import { useOnlineMembers } from '../../store/roomStore'
import type { Member } from '../../types/api'

interface MemberListProps {
  compact?: boolean
}

function MemberAvatar({ member }: { member: Member }) {
  const initial = member.userName.charAt(0).toUpperCase()
  
  return (
    <div
      className="relative flex-shrink-0"
      style={{ 
        width: '36px', 
        height: '36px',
        borderRadius: '50%',
        background: `linear-gradient(135deg, ${member.color} 0%, ${member.color}99 100%)`,
        boxShadow: `0 0 15px ${member.color}66`
      }}
    >
      <div className="w-full h-full flex items-center justify-center text-white font-semibold text-sm">
        {initial}
      </div>
      <div 
        className={`absolute -bottom-0.5 -right-0.5 ${member.isOnline ? 'badge-online' : 'badge-offline'}`}
      />
    </div>
  )
}

export default function MemberList({ compact = false }: MemberListProps) {
  const members = useOnlineMembers()
  
  if (compact) {
    return (
      <div className="flex items-center gap-1">
        <div className="flex -space-x-2">
          {members.slice(0, 5).map((member) => (
            <div key={member.id} className="relative">
              <MemberAvatar member={member} />
            </div>
          ))}
        </div>
        {members.length > 5 && (
          <div className="flex items-center justify-center w-9 h-9 rounded-full bg-dark-700 
            border border-white/10 text-xs text-gray-400 ml-1">
            +{members.length - 5}
          </div>
        )}
        <span className="text-sm text-gray-400 ml-2">
          {members.length} 在线
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-4">
        <Users size={18} className="text-neon-blue" />
        <h3 className="font-medium text-white">在线成员</h3>
        <span className="ml-auto text-sm text-gray-400">
          {members.length} 人
        </span>
      </div>
      
      <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin pr-2">
        {members.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            暂无在线成员
          </div>
        ) : (
          members.map((member) => (
            <div
              key={member.id}
              className="flex items-center gap-3 p-2 rounded-lg glass glass-hover
                transition-all duration-200 group"
            >
              <MemberAvatar member={member} />
              
              <div className="flex-1 min-w-0">
                <div className="font-medium text-white truncate">
                  {member.userName}
                </div>
                <div className="text-xs text-gray-400">
                  {member.isOnline ? '在线' : '离线'}
                </div>
              </div>
              
              <div 
                className="w-2 h-2 rounded-full"
                style={{ 
                  backgroundColor: member.color,
                  boxShadow: member.isOnline ? `0 0 8px ${member.color}` : 'none'
                }}
              />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
