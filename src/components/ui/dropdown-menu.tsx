import * as React from 'react'
import { DropdownMenu as Primitive } from 'radix-ui'
import { cn } from '@/lib/utils'
export const DropdownMenu = Primitive.Root
export const DropdownMenuTrigger = Primitive.Trigger
export function DropdownMenuContent({ className, sideOffset = 5, ...props }: React.ComponentProps<typeof Primitive.Content>) { return <Primitive.Portal><Primitive.Content sideOffset={sideOffset} className={cn('z-50 min-w-44 overflow-hidden rounded-xl border bg-white p-1.5 text-foreground shadow-lg outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95', className)} {...props} /></Primitive.Portal> }
export function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof Primitive.Item>) { return <Primitive.Item className={cn('relative flex cursor-default select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] outline-none transition-colors focus:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted-foreground', className)} {...props} /> }
export function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof Primitive.Separator>) { return <Primitive.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} /> }
