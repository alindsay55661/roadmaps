import { useState } from 'react'
import { Form } from 'react-router'

import { FloatingTooltip } from '~/components/roadmap/FloatingTooltip'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'

type DeleteUserButtonProps = {
  email: string
  disabled?: boolean
  disabledReason?: string
}

export function DeleteUserButton({ email, disabled = false, disabledReason }: DeleteUserButtonProps) {
  const [open, setOpen] = useState(false)

  const button = (
    <Button
      type="button"
      variant="destructive"
      size="sm"
      disabled={disabled}
      onClick={() => setOpen(true)}
    >
      Delete
    </Button>
  )

  return (
    <>
      {disabled && disabledReason ? (
        <FloatingTooltip content={disabledReason} placement="top" maxWidth={220}>
          <span className="inline-flex" tabIndex={0}>
            {button}
          </span>
        </FloatingTooltip>
      ) : (
        button
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete user?</DialogTitle>

            <DialogDescription>
              Permanently delete <span className="text-foreground font-medium">{email}</span>. They will be
              removed from all teams and lose access to Roadmaps. This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>

            <Form method="post" onSubmit={() => setOpen(false)}>
              <input type="hidden" name="email" value={email} />
              <input type="hidden" name="intent" value="delete" />
              <input type="hidden" name="confirm" value="true" />

              <Button type="submit" variant="destructive">
                Delete user
              </Button>
            </Form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
