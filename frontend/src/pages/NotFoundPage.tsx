import { Link } from 'react-router-dom'
import { FileQuestion } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function NotFoundPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <FileQuestion className="h-16 w-16 text-muted-foreground/50" />
      <h1 className="text-2xl font-semibold">404</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        找不到这个页面。请检查链接，或从侧边栏返回主流程。
      </p>
      <Link to="/">
        <Button>返回上传页</Button>
      </Link>
    </div>
  )
}
